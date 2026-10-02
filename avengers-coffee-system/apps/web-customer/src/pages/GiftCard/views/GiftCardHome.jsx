import React from 'react';
import { BannerSlideshow } from '../components/BannerSlideshow';
import { ThreeSteps } from '../components/ThreeSteps';
import { GiftCardForm } from '../components/GiftCardForm';
import { B2BSection } from '../components/B2BSection';
import { FAQsSection } from '../components/FAQsSection';
import { SupportButtons } from '../components/SupportButtons';

export const GiftCardHome = ({ onNavigate }) => (
  <div className="flex flex-col bg-white font-sans">
    <BannerSlideshow />
    <ThreeSteps />
    <GiftCardForm />
    <B2BSection onNavigate={onNavigate} />
    <FAQsSection />
    <SupportButtons onNavigate={onNavigate} />
  </div>
);
