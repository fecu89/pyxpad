import assert from "node:assert/strict";
import { config } from "dotenv";
import type { Metadata } from "next";
import { boardPostRoutePath, decodeBoardRouteSlug } from "../lib/board/route-paths";
import { getPrisma } from "../lib/prisma";
import {
  buildBoardPageMetadata,
  createBoardOpenGraphVersion,
  getBoardShareMetadata,
  type ShareableBoardMetadata,
} from "../utils/seo/boardMetadata";
import { renderOpenGraphImage } from "../utils/seo/openGraphImage";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function metadataImage(metadata: Metadata) {
  const images = metadata.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  if (!first) return "";
  return typeof first === "string" || first instanceof URL ? first.toString() : first.url.toString();
}

function robotsIndex(metadata: Metadata) {
  const robots = metadata.robots;
  return typeof robots === "object" && robots !== null && "index" in robots ? robots.index : undefined;
}

async function main() {
  const unicodeSlug = "우리-반-수능-끝나고-할-것-5272d7";
  const encodedSlug = encodeURIComponent(unicodeSlug);
  const doubleEncodedSlug = encodeURIComponent(encodedSlug);
  assert.equal(decodeBoardRouteSlug(encodedSlug), unicodeSlug);
  assert.equal(decodeBoardRouteSlug(doubleEncodedSlug), unicodeSlug, "기존 이중 인코딩 slug도 복구해야 합니다.");
  const normalizedPostPath = boardPostRoutePath(doubleEncodedSlug, "post-id");
  assert.match(normalizedPostPath, /%EC%9A%B0/);
  assert.doesNotMatch(normalizedPostPath, /%25EC/, "새 게시물 링크가 한글 slug를 다시 이중 인코딩하면 안 됩니다.");

  const prisma = getPrisma();
  const owner = await prisma.user.findFirst({
    where: { status: "ACTIVE", role: { in: ["TEACHER", "SUPER_ADMIN"] } },
    select: { id: true },
  });
  assert.ok(owner, "SEO 검증용 활성 교사 또는 전체관리자가 필요합니다.");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = await Promise.all([
    prisma.board.create({
      data: {
        slug: `verify-seo-link-${suffix}`,
        title: "링크 공유 메타데이터 제목",
        description: "링크 공유 설명",
        ownerId: owner.id,
        discoveryScope: "LINK",
        visitorPermission: "WRITER",
        loginRequired: true,
        backgroundColor: "#e8f0e4",
        accentColor: "#315f43",
      },
      select: { id: true, slug: true },
    }),
    prisma.board.create({
      data: {
        slug: `verify-seo-public-${suffix}`,
        title: "전체 공개 메타데이터 제목",
        description: "전체 공개 설명",
        ownerId: owner.id,
        discoveryScope: "PUBLIC",
        visitorPermission: "READER",
        loginRequired: false,
      },
      select: { id: true, slug: true },
    }),
    prisma.board.create({
      data: {
        slug: `verify-seo-private-${suffix}`,
        title: "노출되면 안 되는 비공개 제목",
        description: "노출되면 안 되는 비공개 설명",
        ownerId: owner.id,
        discoveryScope: "PRIVATE",
      },
      select: { id: true, slug: true },
    }),
    prisma.board.create({
      data: {
        slug: `verify-seo-password-${suffix}`,
        title: "노출되면 안 되는 비밀번호 제목",
        description: "노출되면 안 되는 비밀번호 설명",
        ownerId: owner.id,
        discoveryScope: "LINK",
        visitorPermission: "READER",
        loginRequired: false,
        passwordHash: "verification-placeholder-hash",
      },
      select: { id: true, slug: true },
    }),
  ]);

  try {
    const [link, publicBoard, privateBoard, passwordBoard] = await Promise.all(
      rows.map((row) => getBoardShareMetadata(row.slug)),
    );
    assert.equal(link.kind, "shareable");
    assert.equal(publicBoard.kind, "shareable");
    assert.equal(privateBoard.kind, "protected");
    assert.equal(passwordBoard.kind, "protected");

    const [linkMetadata, publicMetadata, privateMetadata, passwordMetadata] = await Promise.all(
      rows.map((row) => buildBoardPageMetadata(row.slug)),
    );
    assert.equal(linkMetadata.title, "링크 공유 메타데이터 제목");
    assert.equal(linkMetadata.description, "링크 공유 설명");
    assert.equal(robotsIndex(linkMetadata), false, "LINK는 공유 카드만 제공하고 검색 색인은 막아야 합니다.");
    assert.match(metadataImage(linkMetadata), /\/b\/verify-seo-link-.+\/share-image\/[\w-]{12}$/);

    assert.equal(publicMetadata.title, "전체 공개 메타데이터 제목");
    assert.equal(robotsIndex(publicMetadata), true, "익명 읽기 PUBLIC은 검색 색인을 허용해야 합니다.");
    assert.match(metadataImage(publicMetadata), /\/b\/verify-seo-public-.+\/share-image\/[\w-]{12}$/);

    assert.equal(privateMetadata.title, "패드");
    assert.equal(passwordMetadata.title, "패드");
    assert.doesNotMatch(JSON.stringify(privateMetadata), /노출되면 안 되는 비공개/);
    assert.doesNotMatch(JSON.stringify(passwordMetadata), /노출되면 안 되는 비밀번호/);
    assert.match(metadataImage(privateMetadata), /\/opengraph-image$/);
    assert.match(metadataImage(passwordMetadata), /\/opengraph-image$/);

    const shareableLink = link as ShareableBoardMetadata;
    assert.equal(
      createBoardOpenGraphVersion({
        title: shareableLink.title,
        description: shareableLink.description,
        discoveryScope: shareableLink.discoveryScope,
        layout: shareableLink.layout,
        backgroundColor: shareableLink.backgroundColor,
        accentColor: shareableLink.accentColor,
        postCount: shareableLink.postCount,
      }),
      shareableLink.imageVersion,
      "동일한 OG 입력은 같은 버전을 만들어야 합니다.",
    );
    assert.notEqual(
      createBoardOpenGraphVersion({
        title: `${shareableLink.title} 변경`,
        description: shareableLink.description,
        discoveryScope: shareableLink.discoveryScope,
        layout: shareableLink.layout,
        backgroundColor: shareableLink.backgroundColor,
        accentColor: shareableLink.accentColor,
        postCount: shareableLink.postCount,
      }),
      shareableLink.imageVersion,
      "OG에 그려지는 값이 바뀌면 이미지 URL 버전도 바뀌어야 합니다.",
    );

    const shareableImage = await renderOpenGraphImage(shareableLink);
    const defaultImage = await renderOpenGraphImage();
    const [shareableBytes, defaultBytes] = await Promise.all([
      shareableImage.arrayBuffer(),
      defaultImage.arrayBuffer(),
    ]);
    assert.match(shareableImage.headers.get("content-type") ?? "", /image\/png/);
    assert.ok(shareableBytes.byteLength > 10_000, "보드 OG 이미지가 실제 PNG로 렌더링되어야 합니다.");
    assert.ok(defaultBytes.byteLength > 10_000, "기본 OG 이미지가 실제 PNG로 렌더링되어야 합니다.");

    console.log(`seo_metadata_checks=passed boards=${rows.length} unicode_route=normalized shareable_png_bytes=${shareableBytes.byteLength} default_png_bytes=${defaultBytes.byteLength}`);
  } finally {
    await prisma.board.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "SEO 메타데이터 검증에 실패했습니다.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
