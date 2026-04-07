import { useEffect } from 'react';
import Header from '../components/Header';
import Hero from '../components/Hero';
import ScrollIndicator from '../components/ScrollIndicator';
import PainPoints from '../components/PainPoints';
import ProductShowcase from '../components/ProductShowcase';
import WhatItIs from '../components/WhatItIs';
import Features from '../components/Features';
import ProviderCapabilities from '../components/ProviderCapabilities';
import UseCases from '../components/UseCases';
import Steps from '../components/Steps';
import Testimonials from '../components/Testimonials';
import SecurityTransparency from '../components/SecurityTransparency';
import FAQ from '../components/FAQ';
import BottomCTA from '../components/BottomCTA';
import Footer from '../components/Footer';
import UserGuide from '../components/UserGuide';
import { trackPageView } from '../lib/analytics';

export default function Landing() {
  useEffect(() => {
    trackPageView();
  }, []);
  return (
    <div className="min-h-screen bg-[#faf9f5] dark:bg-[#141413] transition-colors">
      <Header />
      <main>
        <Hero />
        <ScrollIndicator />
        <PainPoints />
        <ProductShowcase />
        <WhatItIs />
        <Features />
        <ProviderCapabilities />
        <UseCases />
        <Steps />
        <UserGuide />
        <Testimonials />
        <SecurityTransparency />
        <FAQ />
        <BottomCTA />
      </main>
      <Footer />
    </div>
  );
}
