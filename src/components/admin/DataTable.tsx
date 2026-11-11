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

  return (
    <ListSwap swapKey={computedSwapKey} className={`overflow-x-auto ${className}`}>
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
                  className={`h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] ${alignCls} ${radiusCls} ${
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
    </ListSwap>
  );
}

export default DataTable;
