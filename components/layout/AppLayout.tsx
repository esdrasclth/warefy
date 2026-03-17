'use client';
import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import type { UserProfile } from '@/types';

interface AppLayoutProps {
  children: React.ReactNode;
  userProfile?: UserProfile;
}

export default function AppLayout({ children, userProfile }: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen print:h-auto bg-gray-50 print:bg-white overflow-hidden print:overflow-visible text-foreground">
      <div className="print:hidden z-50 h-full">
        <Sidebar 
          isOpen={isSidebarOpen} 
          setIsOpen={setIsSidebarOpen} 
          userRole={userProfile?.role} 
        />
      </div>
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Topbar onMenuClick={() => setIsSidebarOpen(true)} userProfile={userProfile} />
        </div>
        
        <main className="flex-1 overflow-y-auto print:overflow-visible p-4 md:p-6 lg:p-8 print:p-0 bg-background print:bg-white">
          <div className="mx-auto w-full max-w-[1700px] print:max-w-none print:mx-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
