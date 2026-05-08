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
