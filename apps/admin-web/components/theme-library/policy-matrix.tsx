"use client";

import {
  CANONICAL_FIELD_PATHS,
  FIELD_LABELS,
  FIELD_POLICIES,
  listFontPresets,
  listColorPalettes,
  LAYOUT_PRESET_KEYS,
  getLayoutPreset,
  type CanonicalFieldPath,
  type FieldPolicy,
} from "@commerce-os/theme";
import type { StoreOverridePolicyContract } from "@commerce-os/api-client";

/**
 * TODO-164B Dilim 2 (ADR-239) — Override Policy Matris Editörü. Her canonical alan için
 * durum (editable/locked/inherited/required/hidden) + font/palet/düzen allowlist'leri.
 * Server enforcement asıl otoritedir; bu editör policy'yi ÜRETİR. Kullanıcı-dostu alan
 * etiketleri (field-labels); teknik token adı gösterilmez.
 */

const POLICY_LABEL: Record<FieldPolicy, string> = {
  editable: "Düzenlenebilir",
  locked: "Kilitli",
  inherited: "Miras",
  required: "Zorunlu",
  hidden: "Gizli",
};

const GROUPS: { title: string; paths: CanonicalFieldPath[] }[] = [
  { title: "Marka", paths: ["brand.logo", "brand.favicon", "brand.primaryColor", "brand.accentColor"] },
  {
    title: "Renkler",
    paths: [
      "color.background",
      "color.surface",
      "color.surfaceMuted",
      "color.textPrimary",
      "color.textSecondary",
      "color.border",
      "color.link",
      "color.success",
      "color.warning",
      "color.error",
      "color.focus",
    ],
  },
  { title: "Tipografi", paths: ["typography.headingFont", "typography.bodyFont", "typography.baseSize"] },
  {
    title: "Bileşenler & Düzen",
    paths: [
      "slot.header",
      "slot.footer",
      "slot.productCard",
      "slot.productDetailLayout",
      "slot.productListingLayout",
      "slot.hero",
      "slot.homeSectionFrame",
      "responsive.mobileNavigation",
      "layoutPreset",
    ],
  },
];

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function PolicyMatrix({
  policy,
  onChange,
  disabled,
}: {
  policy: StoreOverridePolicyContract;
  onChange: (next: StoreOverridePolicyContract) => void;
  disabled?: boolean;
}) {
  function setField(path: CanonicalFieldPath, value: FieldPolicy) {
    onChange({ ...policy, fields: { ...policy.fields, [path]: value } });
  }
  function setAll(value: FieldPolicy) {
    const fields: Record<string, FieldPolicy> = {};
    for (const p of CANONICAL_FIELD_PATHS) fields[p] = value;
    onChange({ ...policy, fields });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Toplu:</span>
        {FIELD_POLICIES.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => setAll(p)}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Hepsi: {POLICY_LABEL[p]}
          </button>
        ))}
      </div>

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">{group.title}</legend>
          <div className="space-y-2">
            {group.paths.map((path) => {
              const label = FIELD_LABELS[path];
              const current = (policy.fields[path] as FieldPolicy | undefined) ?? "editable";
              return (
                <div key={path} className="flex items-center justify-between gap-3">
                  <label htmlFor={`pol-${path}`} className="min-w-0 flex-1 truncate text-sm text-slate-700" title={label.descriptionTr}>
                    {label.labelTr}
                  </label>
                  <select
                    id={`pol-${path}`}
                    value={current}
                    disabled={disabled}
                    onChange={(e) => setField(path, e.target.value as FieldPolicy)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40"
                  >
                    {FIELD_POLICIES.map((p) => (
                      <option key={p} value={p}>
                        {POLICY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {/* Allowlist'ler */}
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">İzinli yazı tipleri</legend>
        <p className="mb-2 text-xs text-slate-500">Boş = tüm güvenli yazı tipleri serbest.</p>
        <div className="flex flex-wrap gap-2">
          {listFontPresets().map((f) => {
            const on = policy.allowedFonts.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onChange({ ...policy, allowedFonts: toggle(policy.allowedFonts, f.id) })}
                className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 ${
                  on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600"
                }`}
              >
                {f.nameTr}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">İzinli paletler</legend>
        <p className="mb-2 text-xs text-slate-500">Boş = tüm paletler serbest.</p>
        <div className="flex flex-wrap gap-2">
          {listColorPalettes().map((p) => {
            const on = policy.allowedPalettes.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onChange({ ...policy, allowedPalettes: toggle(policy.allowedPalettes, p.id) })}
                className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 ${
                  on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600"
                }`}
              >
                {p.nameTr}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">İzinli düzenler</legend>
        <p className="mb-2 text-xs text-slate-500">Boş = tüm düzenler serbest.</p>
        <div className="flex flex-wrap gap-2">
          {LAYOUT_PRESET_KEYS.map((key) => {
            const on = policy.allowedLayoutPresets.includes(key);
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onChange({ ...policy, allowedLayoutPresets: toggle(policy.allowedLayoutPresets, key) })}
                className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 ${
                  on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600"
                }`}
              >
                {getLayoutPreset(key)?.nameTr ?? key}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
