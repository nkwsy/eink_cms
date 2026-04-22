export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  return (
    <div className="mx-auto max-w-sm mt-16">
      <div className="card">
        <h1 className="text-xl font-semibold mb-4">eink_cms login</h1>
        <form action="/api/auth/login" method="post" className="space-y-3">
          <input type="hidden" name="next" value={searchParams.next ?? "/"} />
          <div>
            <label className="label">Password</label>
            <input name="password" type="password" autoFocus className="input" />
          </div>
          {searchParams.error && (
            <p className="text-sm text-red-400">Invalid password.</p>
          )}
          <button className="btn btn-primary w-full justify-center">Log in</button>
          <p className="text-xs text-neutral-500">Set <code>APP_PASSWORD</code> in <code>.env</code>.</p>
        </form>
      </div>
    </div>
  );
}
