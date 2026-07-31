"use client";

import styles from "@/components/pad/settings/settings.module.css";
import { LayoutPicker } from "@/components/pad/settings/layout-picker";
import { OptionPicker } from "@/components/pad/settings/option-picker";
import type { PadPresentationSettings } from "@/components/pad/settings/types";

const BACKGROUND_SWATCHES = ["#F4F2EB", "#FDEDEC", "#FEF6E0", "#E8F5E9", "#E3F2FD", "#F3E5F5", "#ECEFF1", "#FFFFFF"];
const ACCENT_SWATCHES = ["#315F44", "#B23A48", "#C97C2C", "#2E7D5B", "#2A6F97", "#6B4E9B", "#37474F", "#C2185B"];

export function PadAppearanceForm({
  value,
  onChange,
}: {
  value: PadPresentationSettings;
  onChange: (value: PadPresentationSettings) => void;
}) {
  function patch(patchValue: Partial<PadPresentationSettings>) {
    onChange({ ...value, ...patchValue });
  }

  return (
    <div className={styles.panel}>
      <fieldset className={styles.group}>
        <legend>레이아웃과 정렬</legend>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span>레이아웃</span>
            <LayoutPicker value={value.layout} onChange={(layout) => patch({ layout })} />
          </div>

          <label className={styles.field}>
            <span>게시물 정렬</span>
            <select value={value.sortMode} onChange={(event) => patch({ sortMode: event.target.value as PadPresentationSettings["sortMode"] })}>
              <option value="MANUAL">수동</option>
              <option value="CREATED_DESC">최신 작성순</option>
              <option value="CREATED_ASC">오래된 작성순</option>
              <option value="TITLE">제목순</option>
              <option value="RANDOM">무작위</option>
            </select>
            {value.sortMode !== "MANUAL" && <p className={styles.note}>자동 정렬 중에는 게시물을 드래그해 순서를 바꿀 수 없습니다.</p>}
          </label>

          <label className={styles.field}>
            <span>새 글 위치</span>
            <select value={value.newPostPlacement} onChange={(event) => patch({ newPostPlacement: event.target.value as "START" | "END" })}>
              <option value="START">앞에 추가</option>
              <option value="END">뒤에 추가</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>카드 크기</span>
            <select value={value.cardSize ?? "MEDIUM"} onChange={(event) => patch({ cardSize: event.target.value as NonNullable<PadPresentationSettings["cardSize"]> })}>
              <option value="SMALL">작게</option>
              <option value="MEDIUM">보통</option>
              <option value="LARGE">크게</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>색상과 글꼴</legend>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span>패드 배경색</span>
            <span className={styles.colorRow}>
              <input type="color" aria-label="패드 배경색 선택" value={value.backgroundColor || "#f4f2eb"} onChange={(event) => patch({ backgroundColor: event.target.value })} />
              <input aria-label="패드 배경색 코드" value={value.backgroundColor || "#f4f2eb"} onChange={(event) => patch({ backgroundColor: event.target.value })} pattern="^#[0-9A-Fa-f]{6}$" />
            </span>
            <span className={styles.swatchRow}>
              {BACKGROUND_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`${styles.swatch} ${value.backgroundColor?.toLowerCase() === swatch.toLowerCase() ? styles.swatchActive : ""}`}
                  style={{ background: swatch }}
                  aria-label={swatch}
                  onClick={() => patch({ backgroundColor: swatch })}
                />
              ))}
            </span>
          </div>

          <div className={styles.field}>
            <span>강조색</span>
            <span className={styles.colorRow}>
              <input type="color" aria-label="강조색 선택" value={value.accentColor || "#315f44"} onChange={(event) => patch({ accentColor: event.target.value })} />
              <input aria-label="강조색 코드" value={value.accentColor || "#315f44"} onChange={(event) => patch({ accentColor: event.target.value })} pattern="^#[0-9A-Fa-f]{6}$" />
            </span>
            <span className={styles.swatchRow}>
              {ACCENT_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`${styles.swatch} ${value.accentColor?.toLowerCase() === swatch.toLowerCase() ? styles.swatchActive : ""}`}
                  style={{ background: swatch }}
                  aria-label={swatch}
                  onClick={() => patch({ accentColor: swatch })}
                />
              ))}
            </span>
          </div>

          <div className={styles.field}>
            <span>글꼴</span>
            <OptionPicker
              name="font"
              variant="tiles"
              value={value.font ?? "SANS"}
              onChange={(font) => patch({ font })}
              options={[
                { value: "SANS", label: "고딕", icon: <span style={{ fontFamily: "var(--font-pretendard), sans-serif", fontWeight: 800, fontSize: 17 }}>Aa</span> },
                { value: "SERIF", label: "명조", icon: <span style={{ fontFamily: "serif", fontWeight: 800, fontSize: 17 }}>Aa</span> },
                { value: "MONO", label: "고정폭", icon: <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 800, fontSize: 17 }}>Aa</span> },
              ]}
            />
          </div>

        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>카드 정보</legend>
        <label className={styles.check}>
          <input type="checkbox" checked={value.showAuthor ?? true} onChange={(event) => patch({ showAuthor: event.target.checked })} />
          <span>작성자 표시<small>카드에 게시물 작성자를 표시합니다.</small></span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={value.showTimestamp ?? true} onChange={(event) => patch({ showTimestamp: event.target.checked })} />
          <span>작성 시간 표시<small>카드에 게시물 작성 시각을 표시합니다.</small></span>
        </label>
      </fieldset>
    </div>
  );
}
