export type CardState = 'unused' | 'partial' | 'full' | 'disabled';
export type ProductColor = 'teal' | 'indigo' | 'amber' | 'rose' | 'violet' | 'sky' | 'koi' | 'slate';
export interface Product { id: string; name: string; color: ProductColor }
export interface Preset { id: string; name: string; productId: string; edition: string; maxDevices: number; quantity: number }
export interface Settings { products: Product[]; templates: Record<string, string>; presets: Preset[]; editions: string[] }
export interface Session {
  username: string; mustChangePassword: boolean; csrf: string; expiresAt: number;
  editions: string[]; products: string[]; publicKey: string; origin: string; settings: Settings;
}
export interface Card {
  cardId: string; productId: string; edition: string; maxDevices: number; issuedAt: number; note: string; status: 'active' | 'disabled';
  customer: string; channel: string; orderNo: string; batchId: string | null; releases: number; hasCode: boolean;
  usedDevices: number; lastSeenAt: number | null; state: CardState;
}
export interface Device { activationId: string; machineFingerprint: string; issuedAt: number; lastSeenAt: number | null }
export interface CardDetail extends Card { devices: Device[] }
export interface Page<T> { items: T[]; total: number; offset: number; limit: number }
export interface Batch {
  batchId: string; productId: string; edition: string; maxDevices: number; quantity: number; note: string; customer: string; channel: string;
  createdAt: number; cards: number; disabled: number; activatedCards: number; activations: number;
}
export interface ActivationLogItem {
  id: number; at: number; productId: string; cardId: string | null; machineFingerprint: string | null; result: string;
  customer: string | null; note: string | null; cardExists: boolean;
}
export interface AuditItem { id: number; at: number; action: string; target: string; detail: string }
export interface ProductStats { productId: string; total: number; unused: number; partial: number; full: number; disabled: number; activations: number }
export interface TrendDay { date: string; activated: number; renewed: number; failed: number }
export interface Dashboard { totals: { total: number; active: number; disabled: number; activations: number }; products: ProductStats[]; trend: TrendDay[] }
export interface LookupResult { kind: 'empty' | 'cardCode' | 'machine' | 'id' | 'text'; cards: Card[] }
export interface GeneratedCard extends CardDetail { cardCode: string }
