'use client';
import { useState } from 'react';
import { SERVICE_CATEGORIES, flattenAllServices } from '../lib/service-categories';

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function ServiceCategorySelector({ selected, onChange, disabled }: Props) {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  const toggle = (serviceId: string) => {
    if (disabled) return;
    onChange(
      selected.includes(serviceId)
        ? selected.filter((s) => s !== serviceId)
        : [...selected, serviceId],
    );
  };

  const allLeafServices = flattenAllServices();

  const catHasSelected = (catId: string) =>
    allLeafServices.some(
      (s) =>
        selected.includes(s.id) &&
        SERVICE_CATEGORIES.find((c) => c.id === catId)?.services.some(
          (top) => top.id === s.id || top.subServices?.some((sub) => sub.id === s.id),
        ),
    );

  return (
    <div className="w-full" dir="rtl">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-2">
        {SERVICE_CATEGORIES.map((cat) => {
          const active = catHasSelected(cat.id);
          const hovered = hoveredCat === cat.id;
          return (
            <div key={cat.id} className="relative">
              <button
                type="button"
                disabled={disabled}
                onMouseEnter={() => !disabled && setHoveredCat(cat.id)}
                onMouseLeave={() => setHoveredCat(null)}
                className={[
                  'px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all duration-150 select-none',
                  active
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-gray-300 hover:border-black',
                  disabled ? 'opacity-50 cursor-default' : 'cursor-pointer',
                ].join(' ')}
              >
                {cat.name}
                {active && (
                  <span className="mr-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold">
                    {allLeafServices.filter(
                      (s) =>
                        selected.includes(s.id) &&
                        cat.services.some(
                          (top) => top.id === s.id || top.subServices?.some((sub) => sub.id === s.id),
                        ),
                    ).length}
                  </span>
                )}
              </button>

              {/* Services dropdown on hover */}
              {hovered && !disabled && (
                <div
                  className="absolute top-full mt-1 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[260px]"
                  onMouseEnter={() => setHoveredCat(cat.id)}
                  onMouseLeave={() => setHoveredCat(null)}
                  style={{ animation: 'fadeSlideDown 0.15s ease' }}
                >
                  {cat.services.map((svc) => {
                    if (svc.subServices) {
                      // Parent group — render as section header + indented sub-items
                      return (
                        <div key={svc.id}>
                          <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-t border-gray-100 mt-1">
                            {svc.name}
                          </div>
                          {svc.subServices.map((sub) => {
                            const checked = selected.includes(sub.id);
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => toggle(sub.id)}
                                className={[
                                  'w-full text-right pr-8 pl-4 py-2 text-[13px] flex items-center gap-2 transition-colors',
                                  checked ? 'bg-gray-50 font-medium text-black' : 'text-black hover:bg-gray-50',
                                ].join(' ')}
                              >
                                <span className={[
                                  'flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center',
                                  checked ? 'bg-black border-black' : 'border-gray-300',
                                ].join(' ')}>
                                  {checked && (
                                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </span>
                                {sub.name}
                              </button>
                            );
                          })}
                        </div>
                      );
                    }
                    const checked = selected.includes(svc.id);
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => toggle(svc.id)}
                        className={[
                          'w-full text-right px-4 py-2 text-[13px] flex items-center gap-2 transition-colors',
                          checked ? 'bg-gray-50 font-medium text-black' : 'text-black hover:bg-gray-50',
                        ].join(' ')}
                      >
                        <span className={[
                          'flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center',
                          checked ? 'bg-black border-black' : 'border-gray-300',
                        ].join(' ')}>
                          {checked && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        {svc.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected services summary */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((id) => {
            const svc = allLeafServices.find((s) => s.id === id);
            if (!svc) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-black text-[12px] rounded-full border border-gray-200"
              >
                {svc.name}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="text-gray-400 hover:text-black transition-colors text-[14px] leading-none"
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
