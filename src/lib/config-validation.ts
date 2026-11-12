/**
 * Runtime validation for database-backed visual configuration.
 *
 * TypeScript types disappear at runtime, while these values are persisted as
 * JSON and later interpolated into CSS/HTML. Keep the validation rules here so
 * reads, admin writes, and future import/migration tools share one boundary.
 */
import { z } from 'zod';
import { appearance as defaultAppearance, type AppearanceConfig } from '../config/appearance';
import type { ThemeDefinition } from '../config/theme';

const cssColorPattern = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.%+-]+(?:\s*[,/]?\s*[\d.%+-]+){2,3}\s*\)|hsla?\(\s*[\d.%+-]+(?:\s*[,/]?\s*[\d.%+-]+){2,3}\s*\)|transparent)$/i;
const safeCssValuePattern = /^[^'"`;{}<>\\\r\n]*$/;
const safeFontNamePattern = /^[^'"`;{}<>\\\r\n]*$/;
const cssLengthPattern = /^\d+(?:\.\d+)?(?:px|rem|vw|%)$/i;

/** CSS color accepted by the theme/background renderers. */
export const cssColorSchema = z.string().trim().min(1).max(96).regex(cssColorPattern, '颜色格式不合法');

const optionalCssColorSchema = z.union([z.literal(''), cssColorSchema]);
const safeCssValueSchema = z.string().trim().max(2_000).regex(safeCssValuePattern, '包含不安全的 CSS 字符');
const safeFontNameSchema = z.string().trim().max(100).regex(safeFontNamePattern, '字体名称包含不安全字符');
const cssLengthSchema = z.string().trim().max(32).regex(cssLengthPattern, '宽度需使用 px、rem、vw 或 %');

/** Strict, complete appearance shape used after defaults have been merged. */
export const appearanceSchema = z.object({
  theme: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, '主题名格式不合法'),
  accent: optionalCssColorSchema,
  background: z.object({
    type: z.enum(['color', 'image', 'gradient']),
    value: safeCssValueSchema,
    overlay: z.object({
      enabled: z.boolean(),
      color: cssColorSchema,
      opacity: z.number().min(0).max(1),
    }).strict(),
    blur: z.number().min(0).max(100),
    position: z.string().trim().min(1).max(64).regex(safeCssValuePattern, '背景位置包含不安全字符'),
    size: z.enum(['cover', 'contain', 'repeat']),
  }).strict(),
  card: z.object({
    style: z.enum(['solid', 'glass', 'border', 'minimal']),
    opacity: z.number().min(0).max(1),
    radius: z.enum(['none', 'small', 'medium', 'large', 'pill']),
    shadow: z.enum(['none', 'subtle', 'medium']),
  }).strict(),
  layout: z.object({
    mode: z.enum(['grid', 'list', 'mixed']),
    density: z.enum(['compact', 'comfortable', 'spacious']),
    maxWidth: cssLengthSchema,
  }).strict(),
  font: z.object({
    sans: safeFontNameSchema,
    heading: safeFontNameSchema,
    mono: safeFontNameSchema,
  }).strict(),
  effects: z.object({
    backgroundGlow: z.boolean(),
    noise: z.boolean(),
    grid: z.boolean(),
  }).strict(),
  avatar: z.object({
    enabled: z.boolean(),
    src: safeCssValueSchema,
    shape: z.enum(['circle', 'rounded', 'square']),
  }).strict(),
  themeMode: z.enum(['system', 'light', 'dark']),
}).strict();

const paletteSchema = z.object({
  background: cssColorSchema,
  foreground: cssColorSchema,
  muted: cssColorSchema,
  accent: cssColorSchema,
  card: cssColorSchema,
  border: cssColorSchema,
}).strict();

/** Theme schema shared by persistence and rendering. */
export const themeDefinitionSchema = z.object({
  light: paletteSchema,
  dark: paletteSchema,
}).strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneDefaultAppearance(): AppearanceConfig {
  return structuredClone(defaultAppearance);
}

/**
 * Merge a partial persisted object with defaults without allowing unknown keys
 * to leak into the validated result.
 */
function mergeAppearanceDefaults(value: unknown): AppearanceConfig {
  const input = isRecord(value) ? value : {};
  const background = isRecord(input.background) ? input.background : {};
  const overlay = isRecord(background.overlay) ? background.overlay : {};
  const card = isRecord(input.card) ? input.card : {};
  const layout = isRecord(input.layout) ? input.layout : {};
  const font = isRecord(input.font) ? input.font : {};
  const effects = isRecord(input.effects) ? input.effects : {};
  const avatar = isRecord(input.avatar) ? input.avatar : {};

  return {
    theme: (input.theme ?? defaultAppearance.theme) as AppearanceConfig['theme'],
    accent: (input.accent ?? defaultAppearance.accent) as AppearanceConfig['accent'],
    background: {
      type: (background.type ?? defaultAppearance.background.type) as AppearanceConfig['background']['type'],
      value: (background.value ?? defaultAppearance.background.value) as string,
      overlay: {
        enabled: (overlay.enabled ?? defaultAppearance.background.overlay.enabled) as boolean,
        color: (overlay.color ?? defaultAppearance.background.overlay.color) as string,
        opacity: (overlay.opacity ?? defaultAppearance.background.overlay.opacity) as number,
      },
      blur: (background.blur ?? defaultAppearance.background.blur) as number,
      position: (background.position ?? defaultAppearance.background.position) as string,
      size: (background.size ?? defaultAppearance.background.size) as AppearanceConfig['background']['size'],
    },
    card: {
      style: (card.style ?? defaultAppearance.card.style) as AppearanceConfig['card']['style'],
      opacity: (card.opacity ?? defaultAppearance.card.opacity) as number,
      radius: (card.radius ?? defaultAppearance.card.radius) as AppearanceConfig['card']['radius'],
      shadow: (card.shadow ?? defaultAppearance.card.shadow) as AppearanceConfig['card']['shadow'],
    },
    layout: {
      mode: (layout.mode ?? defaultAppearance.layout.mode) as AppearanceConfig['layout']['mode'],
      density: (layout.density ?? defaultAppearance.layout.density) as AppearanceConfig['layout']['density'],
      maxWidth: (layout.maxWidth ?? defaultAppearance.layout.maxWidth) as string,
    },
    font: {
      sans: (font.sans ?? defaultAppearance.font.sans) as string,
      heading: (font.heading ?? defaultAppearance.font.heading) as string,
      mono: (font.mono ?? defaultAppearance.font.mono) as string,
    },
    effects: {
      backgroundGlow: (effects.backgroundGlow ?? defaultAppearance.effects.backgroundGlow) as boolean,
      noise: (effects.noise ?? defaultAppearance.effects.noise) as boolean,
      grid: (effects.grid ?? defaultAppearance.effects.grid) as boolean,
    },
    avatar: {
      enabled: (avatar.enabled ?? defaultAppearance.avatar.enabled) as boolean,
      src: (avatar.src ?? defaultAppearance.avatar.src) as string,
      shape: (avatar.shape ?? defaultAppearance.avatar.shape) as AppearanceConfig['avatar']['shape'],
    },
    themeMode: (input.themeMode ?? defaultAppearance.themeMode) as AppearanceConfig['themeMode'],
  };
}

/** Read-path parser: malformed persisted data safely falls back to defaults. */
export function parseAppearance(raw: string | null | undefined): AppearanceConfig {
  if (!raw) return cloneDefaultAppearance();
  try {
    const result = appearanceSchema.safeParse(mergeAppearanceDefaults(JSON.parse(raw)));
    return result.success ? result.data : cloneDefaultAppearance();
  } catch {
    return cloneDefaultAppearance();
  }
}

/** Write-path parser: validates and canonicalizes a partial or complete JSON object. */
export function validateAppearanceJson(raw: string):
  | { success: true; value: string; data: AppearanceConfig }
  | { success: false; error: string } {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { success: false, error: 'appearance 必须是合法 JSON' };
  }
  if (!isRecord(input)) return { success: false, error: 'appearance 必须是 JSON 对象' };

  const result = appearanceSchema.safeParse(mergeAppearanceDefaults(input));
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') || 'appearance';
    return { success: false, error: `${path}: ${issue?.message ?? '配置不合法'}` };
  }
  return { success: true, value: JSON.stringify(result.data), data: result.data };
}

/** Validate a theme loaded from JSON, returning null instead of throwing. */
export function parseThemeDefinition(raw: string): ThemeDefinition | null {
  try {
    const result = themeDefinitionSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
