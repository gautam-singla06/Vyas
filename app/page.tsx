import { getCurrentStaff } from "@/lib/auth/context";
import NavBar from "@/components/landing/NavBar";
import HeroSection from "@/components/landing/HeroSection";
import TrustSection from "@/components/landing/TrustSection";
import WhoUsesSection from "@/components/landing/WhoUsesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import WhyVyasSection from "@/components/landing/WhyVyasSection";
import FooterSection from "@/components/landing/FooterSection";

// Force dynamic — auth lookup is server-side
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const staff = await getCurrentStaff();

  return (
    <div className="min-h-screen bg-ms-bg">
      <NavBar staff={staff ? { name: staff.name, role: staff.role } : null} />
      
      <main>
        <HeroSection />
        <TrustSection />
        
        {/* Key Features / Why Vyas */}
        <FeaturesSection />
        <WhyVyasSection />

        {/* How Vyas Works */}
        <HowItWorksSection />
        <WhoUsesSection />
      </main>

      <FooterSection />
    </div>
  );
}
