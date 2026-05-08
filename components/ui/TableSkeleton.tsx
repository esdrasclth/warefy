export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-50">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="py-3 px-3">
              <div
                className={`h-2.5 bg-gray-100 animate-pulse ${
                  j === 0 ? 'w-14' : j === 1 ? 'w-36' : j === cols - 1 ? 'w-10 mx-auto' : 'w-20'
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Skeleton for metric/stat cards (dashboard)
export function CardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-2 w-20 bg-gray-100 animate-pulse" />
              <div className="h-8 w-28 bg-gray-100 animate-pulse" />
              <div className="h-2 w-16 bg-gray-100 animate-pulse" />
            </div>
            <div className="w-10 h-10 bg-gray-100 animate-pulse rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Skeleton for detail pages: info cards + table
export function DetailSkeleton({ cards = 3, tableRows = 5, tableCols = 4 }: { cards?: number; tableRows?: number; tableCols?: number }) {
  return (
    <div className="space-y-8">
      <div className={`grid grid-cols-1 md:grid-cols-${cards} gap-6`}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-100 p-6 shadow-sm space-y-3">
            <div className="h-2 w-24 bg-gray-100 animate-pulse" />
            <div className="h-6 w-36 bg-gray-100 animate-pulse" />
            <div className="h-2 w-28 bg-gray-100 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-10 bg-gray-100 animate-pulse" />
        <table className="w-full">
          <tbody>
            <TableSkeleton rows={tableRows} cols={tableCols} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Skeleton for form pages (configuracion, etc.)
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-2 w-32 bg-gray-100 animate-pulse" />
          <div className="h-10 w-full bg-gray-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// Skeleton for grouped blocks (sugerencias)
export function GroupedSkeleton({ groups = 2, rowsPerGroup = 3 }: { groups?: number; rowsPerGroup?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-12 bg-gray-100 animate-pulse" />
          <table className="w-full">
            <tbody>
              <TableSkeleton rows={rowsPerGroup} cols={7} />
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
