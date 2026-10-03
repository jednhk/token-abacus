import { setups } from "@/lib/content";

export function LeanSetups() {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:px-6 sm:pt-16 sm:pb-28">
      <div className="max-w-xl">
        <h2 className="font-serif text-[2rem] leading-none tracking-tight sm:text-4xl">
          Setups that spend less
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-neutral-500 sm:text-base">
          Sample estimates for the layout. Live counts connect later.
        </p>
      </div>

      <ul className="mt-8 grid gap-3 md:hidden">
        {setups.map((setup) => (
          <li
            key={setup.name}
            className="rounded-2xl border border-neutral-200 px-4 py-4"
          >
            <p className="font-medium">{setup.name}</p>
            <p className="mt-1 text-sm text-neutral-500">{setup.bestFor}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-neutral-400">Tokens</dt>
                <dd className="mt-1 tabular-nums">{setup.tokens}</dd>
              </div>
              <div>
                <dt className="text-neutral-400">Saves</dt>
                <dd className="mt-1 tabular-nums">{setup.saves}</dd>
              </div>
              <div>
                <dt className="text-neutral-400">Updated</dt>
                <dd className="mt-1">{setup.updated}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="mt-8 hidden overflow-hidden rounded-3xl border border-neutral-200 md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Sample setups and the tokens they save
          </caption>
          <thead className="text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className="px-5 py-3 font-medium">Setup</th>
              <th className="px-5 py-3 font-medium">Best for</th>
              <th className="px-5 py-3 font-medium">Tokens</th>
              <th className="px-5 py-3 font-medium">Saves</th>
              <th className="px-5 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {setups.map((setup) => (
              <tr key={setup.name} className="border-b border-neutral-100 last:border-0">
                <td className="px-5 py-4 font-medium">{setup.name}</td>
                <td className="px-5 py-4 text-neutral-500">{setup.bestFor}</td>
                <td className="px-5 py-4 tabular-nums">{setup.tokens}</td>
                <td className="px-5 py-4 tabular-nums">{setup.saves}</td>
                <td className="px-5 py-4 text-neutral-500">{setup.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
