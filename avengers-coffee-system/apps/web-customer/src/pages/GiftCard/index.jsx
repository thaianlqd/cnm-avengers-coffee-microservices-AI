import React, { useState, useEffect } from 'react';
import { GiftCardHeader } from './components/GiftCardHeader';
import { GiftCardFooter } from './components/GiftCardFooter';
import { GiftCardHome } from './views/GiftCardHome';
import { GiftCardAbout } from './views/GiftCardAbout';
import { GiftCardPolicy } from './views/GiftCardPolicy';
import { GiftCardSupport } from './views/GiftCardSupport';
import { GiftCardB2B } from './views/GiftCardB2B';
import { GiftCardPromos } from './views/GiftCardPromos';
import { GiftCardCollection } from './views/GiftCardCollection';

const GiftCardPage = () => {
  const getInitialPage = () => {
    const hash = window.location.hash.replace('#', '');
    return hash ? hash : 'home';
  };
  
  const [activePage, setActivePage] = useState(getInitialPage);

  useEffect(() => {
    const handleHashChange = () => {
      setActivePage(getInitialPage());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (page) => { 
    if (page === 'home') {
      window.history.pushState(null, '', window.location.pathname + window.location.search);
    } else {
      window.history.pushState(null, '', '#' + page);
    }
    setActivePage(page); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const renderPage = () => {
    switch (activePage) {
      case 've-the':         return <GiftCardAbout onNavigate={handleNavigate} />;
      case 'chinh-sach':     return <GiftCardPolicy />;
      case 'ho-tro':         return <GiftCardSupport onNavigate={handleNavigate} />;
      case 'mua-so-luong-lon': return <GiftCardB2B onNavigate={handleNavigate} />;
      case 'khuyen-mai':     return <GiftCardPromos />;
      case 'bo-suu-tap':     return <GiftCardCollection onNavigate={handleNavigate} />;
      default:               return <GiftCardHome onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GiftCardHeader activePage={activePage} onNavigate={handleNavigate} />
      <main className="flex-1">{renderPage()}</main>
      <GiftCardFooter onNavigate={handleNavigate} />
    </div>
  );
};

export default GiftCardPage;
