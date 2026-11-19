import { useMutation } from "@tanstack/react-query";
import { useApp } from "../context";
import { guest } from "../storage/journal";
import { signIn, signOut } from "../storage/sync";
import Identity from "./Identity";
export default function Account() {
  const { t, owner, setOwner, calendar, setCalendar, notice } = useApp();
  const auth = useMutation({
    mutationFn: async (data: FormData | null) => {
      if (data) {
        setOwner(
          await signIn(
            String(data.get("username")),
            String(data.get("password")),
          ),
        );
      } else {
        if (!owner.startsWith("restore:")) await signOut();
        setOwner(guest);
      }
    },
    onError: () => notice(t.error),
  });
  return (
    <>
      <h1>{t.account}</h1>
      <section className="panel">
        <h2>
          {owner === guest
            ? t.local
            : owner.startsWith("restore:")
              ? t.restored
              : t.server}
        </h2>
        {owner === guest ? (
          <>
            <p>{t.guestHelp}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                auth.mutate(new FormData(e.currentTarget));
              }}
            >
              <label>
                {t.username}
                <input
                  autoComplete="username"
                  name="username"
                  required
                  dir="auto"
                />
              </label>
              <label>
                {t.password}
                <input
                  autoComplete="current-password"
                  name="password"
                  type="password"
                  required
                />
              </label>
              <button disabled={auth.isPending}>{t.login}</button>
            </form>
            <Identity />
          </>
        ) : (
          <button onClick={() => auth.mutate(null)} disabled={auth.isPending}>
            {owner.startsWith("restore:") ? t.exitCopy : t.logout}
          </button>
        )}
      </section>
      <label>
        {t.calendar}
        <select value={calendar} onChange={(e) => setCalendar(e.target.value)}>
          <option value="persian">{t.persian}</option>
          <option value="gregory">{t.gregory}</option>
        </select>
      </label>
    </>
  );
}
