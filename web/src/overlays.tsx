import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { CardSheet } from './features/CardSheet';
import { GenerateDialog, type GeneratePrefill } from './features/GenerateDialog';
import { LookupDialog } from './features/LookupDialog';

// App-wide overlays that any page (or keyboard shortcut) can open.
interface Overlays { openCard: (cardId: string) => void; openGenerate: (prefill?: GeneratePrefill) => void; openLookup: (query?: string) => void }
const OverlayContext = createContext<Overlays>({ openCard: () => {}, openGenerate: () => {}, openLookup: () => {} });
export const useOverlays = () => useContext(OverlayContext);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<string | null>(null);
  const [generate, setGenerate] = useState<{ key: number; prefill: GeneratePrefill } | null>(null);
  const [lookup, setLookup] = useState<{ key: number; query: string } | null>(null);
  const value = useMemo<Overlays>(() => ({
    openCard: id => { setLookup(null); setCard(id); },
    openGenerate: (prefill = {}) => { setCard(null); setGenerate({ key: Date.now(), prefill }); },
    openLookup: (query = '') => setLookup({ key: Date.now(), query }),
  }), []);
  return (
    <OverlayContext.Provider value={value}>
      {children}
      {card && <CardSheet key={card} cardId={card} onClose={() => setCard(null)} />}
      {generate && <GenerateDialog key={generate.key} prefill={generate.prefill} onClose={() => setGenerate(null)} />}
      {lookup && <LookupDialog key={lookup.key} initial={lookup.query} onClose={() => setLookup(null)} />}
    </OverlayContext.Provider>
  );
}
