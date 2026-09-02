'use client';

import { useMemo, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { INITIATIVE_GLYPHS, INITIATIVE_ICON_COLORS, InitiativeGlyph } from './initiative-glyph';

const EMOJIS = [
   { value: '🎯', label: 'Target' },
   { value: '🚀', label: 'Rocket' },
   { value: '✨', label: 'Sparkles' },
   { value: '🧭', label: 'Compass' },
   { value: '🏁', label: 'Finish flag' },
   { value: '💡', label: 'Light bulb' },
   { value: '⚡', label: 'Lightning' },
   { value: '📈', label: 'Growth chart' },
   { value: '🛠️', label: 'Tools' },
   { value: '🌱', label: 'Seedling' },
   { value: '🔒', label: 'Lock' },
   { value: '🤝', label: 'Handshake' },
   { value: '🔥', label: 'Fire' },
   { value: '⭐', label: 'Star' },
   { value: '🌍', label: 'Globe' },
   { value: '🏆', label: 'Trophy' },
   { value: '💎', label: 'Gem' },
   { value: '🧩', label: 'Puzzle' },
   { value: '🛡️', label: 'Shield' },
   { value: '📦', label: 'Package' },
   { value: '🔑', label: 'Key' },
   { value: '❤️', label: 'Heart' },
   { value: '☀️', label: 'Sun' },
   { value: '☁️', label: 'Cloud' },
   { value: '🔭', label: 'Telescope' },
   { value: '📣', label: 'Megaphone' },
   { value: '🗺️', label: 'Map' },
] as const;

export function InitiativeIconPicker({
   icon,
   color,
   onIconChange,
   onColorChange,
   compact = false,
}: {
   icon: string;
   color: string;
   onIconChange: (icon: string) => void;
   onColorChange: (color: string) => void;
   compact?: boolean;
}) {
   const [tab, setTab] = useState<'icons' | 'emojis'>('icons');
   const [query, setQuery] = useState('');
   const tabRefs = useRef<Record<'icons' | 'emojis', HTMLButtonElement | null>>({
      icons: null,
      emojis: null,
   });
   const visibleIcons = useMemo(
      () =>
         INITIATIVE_GLYPHS.filter((entry) =>
            entry.label.toLowerCase().includes(query.trim().toLowerCase())
         ),
      [query]
   );
   const visibleEmojis = useMemo(
      () =>
         EMOJIS.filter((entry) => entry.label.toLowerCase().includes(query.trim().toLowerCase())),
      [query]
   );

   const selectTab = (nextTab: 'icons' | 'emojis') => {
      setTab(nextTab);
      setQuery('');
   };

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button
               type="button"
               variant="ghost"
               size="icon"
               className={cn('shrink-0 rounded-md bg-muted/50', compact ? 'size-7' : 'size-8')}
               aria-label="Choose icon"
            >
               <InitiativeGlyph
                  icon={icon}
                  color={color}
                  className={compact ? 'size-4' : 'size-[18px]'}
               />
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" sideOffset={6} className="w-[412px] p-0">
            <div
               role="tablist"
               aria-label="Icon type"
               className="flex h-10 items-end gap-1 border-b px-3"
            >
               {(['icons', 'emojis'] as const).map((candidate) => (
                  <button
                     key={candidate}
                     ref={(node) => {
                        tabRefs.current[candidate] = node;
                     }}
                     type="button"
                     role="tab"
                     id={`initiative-${candidate}-tab`}
                     aria-controls={`initiative-${candidate}-panel`}
                     aria-selected={tab === candidate}
                     tabIndex={tab === candidate ? 0 : -1}
                     onClick={() => selectTab(candidate)}
                     onKeyDown={(event) => {
                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                        event.preventDefault();
                        const nextTab = candidate === 'icons' ? 'emojis' : 'icons';
                        selectTab(nextTab);
                        tabRefs.current[nextTab]?.focus();
                     }}
                     className={cn(
                        'h-9 border-b-2 px-2 text-xs font-medium capitalize transition-colors',
                        tab === candidate
                           ? 'border-primary text-foreground'
                           : 'border-transparent text-muted-foreground hover:text-foreground'
                     )}
                  >
                     {candidate === 'icons' ? 'Icons' : 'Emojis'}
                  </button>
               ))}
            </div>
            {tab === 'icons' && (
               <div className="flex items-center gap-2 border-b px-3 py-2" aria-label="Icon colors">
                  {INITIATIVE_ICON_COLORS.map((candidate) => (
                     <button
                        key={candidate.key}
                        type="button"
                        onClick={() => onColorChange(candidate.key)}
                        aria-label={`Set icon color ${candidate.label}`}
                        aria-pressed={color === candidate.key}
                        className={cn(
                           'size-5 rounded-full border-2 border-popover ring-offset-1 transition-transform hover:scale-110',
                           color === candidate.key && 'ring-2 ring-ring'
                        )}
                        style={{ backgroundColor: candidate.value }}
                     />
                  ))}
                  <label className="relative flex size-5 cursor-pointer items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                     <Palette className="size-3" />
                     <span className="sr-only">Custom icon color</span>
                     <input
                        type="color"
                        aria-label="Custom icon color"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={(event) => onColorChange(event.target.value)}
                     />
                  </label>
               </div>
            )}
            <div
               role="tabpanel"
               id={`initiative-${tab}-panel`}
               aria-labelledby={`initiative-${tab}-tab`}
               className="p-3"
            >
               <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tab === 'icons' ? 'Search icons…' : 'Search emoji…'}
                  aria-label={tab === 'icons' ? 'Search icons' : 'Search emoji'}
                  className="mb-3 h-8"
               />
               <div className="grid max-h-52 grid-cols-9 gap-1 overflow-y-auto">
                  {tab === 'icons'
                     ? visibleIcons.map((entry) => (
                          <button
                             key={entry.key}
                             type="button"
                             onClick={() => onIconChange(entry.key)}
                             aria-label={entry.label}
                             aria-pressed={icon === entry.key}
                             className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-accent"
                          >
                             <InitiativeGlyph icon={entry.key} color={color} />
                          </button>
                       ))
                     : visibleEmojis.map((emoji) => (
                          <button
                             key={emoji.value}
                             type="button"
                             onClick={() => onIconChange(emoji.value)}
                             aria-label={emoji.label}
                             aria-pressed={icon === emoji.value}
                             className="flex size-9 items-center justify-center rounded-md text-lg hover:bg-accent aria-pressed:bg-accent"
                          >
                             {emoji.value}
                          </button>
                       ))}
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}
