import Link from "next/link";

interface CategoryCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

export default function CategoryCard({ title, description, href, icon }: CategoryCardProps) {
  return (
    <Link href={href} className="block group h-full">
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-ms-md border border-ms-border bg-ms-surface shadow-card hover:shadow-card-lg hover:-translate-y-1 transition-all duration-300 ms-fade-rise h-full">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint text-brand group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h3 className="mb-2 text-xl font-bold text-ms-textPrimary tracking-tight">{title}</h3>
        <p className="text-sm text-ms-textSecondary mb-6 max-w-sm">{description}</p>
        <div className="mt-auto flex items-center justify-center gap-2 text-brand font-semibold text-sm group-hover:gap-3 transition-all duration-300">
          View Facilities
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
