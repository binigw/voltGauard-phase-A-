/**
 * Production authentication policy.
 *
 * Protected application routes must require a valid Supabase session and the
 * existing fail-closed route guard. Public competition access has ended and
 * must not be re-enabled in a production build.
 */
export const COMPETITION_PUBLIC_ACCESS = false;
