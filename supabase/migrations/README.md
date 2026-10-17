# MediServ — Database Migrations

Applies the schema from `ARCHITECTURE.md` Section 7 and the RLS policy matrix
from `DECISIONS.md` ADR-007.

## Apply with the Supabase CLI (local or linked project)

```bash
# Local dev database (Supabase CLI spins up Postgres + Auth locally):
supabase start
supabase db push      # applies 0001_schema_and_rls.sql then 0002_seed.sql

# Against your hosted Supabase project:
supabase link --project-ref <your-project-ref>
supabase db push
```

## Apply via the Supabase SQL editor (fastest for the hackathon demo)

Open the Supabase dashboard → SQL Editor, then paste and run, in order:

1. `0001_schema_and_rls.sql` — schema + enums + RLS policies
2. `0002_seed.sql` — 5 facilities + bed/test/stock + 14 days of stock_logs

## Tables & RLS summary

| Table | Read | Write |
|---|---|---|
| `facilities` | open (public lookup needs it) | service role only |
| `staff` | self + district admin | service role only (admin-provisioned) |
| `stock_items` | public read; district admin; own facility | own facility staff |
| `stock_logs` | own facility + district admin (NOT public) | own facility staff insert |
| `bed_status` | public read; district admin; own facility | own facility staff |
| `doctor_attendance` | self + district admin | self (the doctor) |
| `test_availability` | public read; district admin; own facility | own facility staff |
| `footfall_logs` | own facility + district admin | own facility staff |
| `flags` | own facility + district admin | service role (AI module) only |
| `redistribution_suggestions` | district admin | service role insert; admin update status only |
| `chat_logs` | service role (audit) | insert by anyone (anon OK) |

The boundary `nurse of facility A cannot write facility B's stock` is enforced
at the database layer (RLS), not just the UI — the explicit hard requirement
from ADR-007. Verify with the cross-facility RLS test in Phase 15.
