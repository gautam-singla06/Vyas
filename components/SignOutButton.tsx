// Sign-out control. Renders a same-origin POST form (not a link) so signing
// out can't be triggered by a cross-site GET such as `<img src="/sign-out">`.
// Plain HTML form — no client JS required, works inside server components.
export default function SignOutButton({
  className,
  children = "Sign out",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <form action="/sign-out" method="post" className="inline">
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
