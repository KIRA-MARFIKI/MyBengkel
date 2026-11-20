import React from 'react';
import { ListSwap, setLastTriggerElement } from './island/IslandSystem';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  align?: 'right' | 'center';
  identity?: boolean;
  isStatus?: boolean;
  mobileHidden?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onRowClick?: (item: T) => void;
  rowBorderLeft?: (item: T) => string | undefined;
  flashKey?: string | null;
  emptyMessage?: string;
  avatarExtractor?: (item: T, index: number) => string;
  renderAfterRow?: (item: T, index: number) => React.ReactNode;
  className?: string;
  swapKey?: string;
}

// Tables: header strip (#F6F7FA) with radius 12, 56px rows, 1px divider (#EEF0F4) between rows only, no vertical lines.
export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  rowBorderLeft,
  flashKey,
  emptyMessage = 'Tidak ada data.',
  renderAfterRow,
  className = '',
  swapKey,
}: DataTableProps<T>) {
  if (data.length === 0 && emptyMessage) {
    return (
      <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA]">
        <p className="text-[14px] text-[#646B7C]">{emptyMessage}</p>
      </div>
    );
  }

  const cell = (col: Column<T>, item: T, index: number): React.ReactNode =>
    col.render ? col.render(item, index) : ((item as Record<string, unknown>)[col.key] as React.ReactNode);

  const onKey = (e: React.KeyboardEvent<HTMLTableRowElement>, item: T) => {
    if (e.target !== e.currentTarget) return;
    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setLastTriggerElement(e.currentTarget);
      onRowClick(item);
    }
  };

  const computedSwapKey =
    swapKey ??
    `${columns.map((c) => c.key).join('|')}::${data
      .slice(0, 12)
      .map((item, idx) => keyExtractor(item, idx))
      .join(',')}`;

  const identityCol = columns.find((c) => c.identity) || columns[0];
  const statusCol = columns.find((c) => c.isStatus && c.key !== identityCol?.key);
  const actionCol = columns.find(
    (c) =>
      c.key === 'aksi' ||
      c.key === 'actions' ||
      String(c.header || '').trim().toLowerCase() === 'aksi'
  );
  const detailCols = columns.filter(
    (c) =>
      c.key !== identityCol?.key &&
      c.key !== statusCol?.key &&
      c.key !== actionCol?.key
  );

  return (
    <ListSwap swapKey={computedSwapKey} className={`w-full min-w-0 ${className}`}>
      {/* Mobile (< 768px): Stacked cards without horizontal scrolling */}
      <div className="space-y-3 md:hidden">
        {data.map((item, index) => {
          const key = keyExtractor(item, index);
          const afterContent = renderAfterRow ? renderAfterRow(item, index) : null;
          return (
            <div
              key={key}
              data-row-id={key}
              onClick={(e) => {
                if (onRowClick) {
                  setLastTriggerElement(e.currentTarget);
                  onRowClick(item);
                }
              }}
              onKeyDown={(e) => onKey(e as any, item)}
              tabIndex={onRowClick ? 0 : undefined}
              className={`rounded-[14px] border border-[#E6E9F0] bg-white p-3.5 space-y-3 transition-colors ${
                onRowClick ? 'cursor-pointer active:bg-[#F6F7FA]' : ''
              } ${flashKey === key ? 'admin-row-flash' : ''} ${rowBorderLeft?.(item) || ''}`}
            >
              <div className="flex items-start justify-between gap-2.5 min-w-0">
                <div className="min-w-0 flex-1 break-words">
                  {identityCol ? cell(identityCol, item, index) : null}
                </div>
                {statusCol && (
                  <div className="shrink-0">{cell(statusCol, item, index)}</div>
                )}
              </div>

              {detailCols.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t border-[#EEF0F4] text-[13px]">
                  {detailCols.map((col) => (
                    <div key={col.key} className="min-w-0 break-words">
                      <div className="text-[11px] font-medium text-[#646B7C]">
                        {col.header}
                      </div>
                      <div className="mt-0.5 text-[#1E2230]">
                        {cell(col, item, index)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {afterContent && (
                <div className="pt-2 border-t border-[#EEF0F4] text-[13px] text-[#1E2230]">
                  {afterContent}
                </div>
              )}

              {actionCol && (
                <div
                  className="pt-2.5 border-t border-[#EEF0F4] flex flex-wrap items-center justify-end gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {cell(actionCol, item, index)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop / Tablet (>= 768px): Structured table */}
      <div className="hidden md:block overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full text-left border-collapse text-[14px] text-[#1E2230] min-w-[520px] bg-white">
          <thead>
            <tr className="bg-[#F6F7FA]">
              {columns.map((col, idx) => {
                const alignCls =
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                const radiusCls =
                  idx === 0 && columns.length === 1
                    ? 'rounded-[12px]'
                    : idx === 0
                    ? 'rounded-l-[12px]'
                    : idx === columns.length - 1
                    ? 'rounded-r-[12px]'
                    : '';
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] whitespace-nowrap ${alignCls} ${radiusCls} ${
                      col.className || ''
                    }`}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => {
              const key = keyExtractor(item, index);
              const afterContent = renderAfterRow ? renderAfterRow(item, index) : null;

              return (
                <React.Fragment key={key}>
                  <tr
                    data-row-id={key}
                    onClick={(e) => {
                      if (onRowClick) {
                        setLastTriggerElement(e.currentTarget);
                        onRowClick(item);
                      }
                    }}
                    onKeyDown={(e) => onKey(e, item)}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={`row h-14 border-b border-[#EEF0F4] last:border-b-0 bg-white transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-[#F6F7FA]' : ''
                    } ${flashKey === key ? 'admin-row-flash' : ''} ${rowBorderLeft?.(item) || ''}`}
                  >
                    {columns.map((col) => {
                      const alignCls =
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                      return (
                        <td
                          key={col.key}
                          className={`px-3.5 py-2 align-middle text-[#1E2230] ${alignCls} ${col.className || ''}`}
                        >
                          {cell(col, item, index)}
                        </td>
                      );
                    })}
                  </tr>
                  {afterContent && (
                    <tr className="bg-[#F6F7FA] border-b border-[#EEF0F4]">
                      <td colSpan={columns.length} className="px-4 py-3 text-[14px] text-[#1E2230]">
                        {afterContent}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </ListSwap>
  );
}

export default DataTable;
