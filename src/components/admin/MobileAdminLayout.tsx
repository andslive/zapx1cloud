import { ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NavLink } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { ArrowLeft, Settings, Menu } from 'lucide-react';
import {
  fixedItems,
  menuGroups,
  allMenuItems,
  findGroupIdForSection,
} from '@/config/adminMenu';
import type { AdminMenuItem } from '@/config/adminMenu';
import { prefetchAdminSection } from '@/pages/Admin';

interface MobileAdminLayoutProps {
  children: ReactNode;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function MobileAdminLayout({ 
  children, 
  activeSection, 
  onSectionChange 
}: MobileAdminLayoutProps) {
  const [open, setOpen] = useState(false);

  const handleSectionChange = (section: string) => {
    onSectionChange(section);
    setOpen(false);
  };

  const currentSection = allMenuItems.find(item => item.id === activeSection);
  const activeGroupId = findGroupIdForSection(activeSection);

  const renderMenuItem = (item: AdminMenuItem) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    const isDisabled = !!item.comingSoon;

    return (
      <button
        key={item.id}
        onClick={() => {
          if (isDisabled) return;
          handleSectionChange(item.id);
        }}
        onTouchStart={() => !isDisabled && prefetchAdminSection(item.id)}
        onMouseEnter={() => !isDisabled && prefetchAdminSection(item.id)}
        disabled={isDisabled}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all',
          isDisabled
            ? 'text-foreground/50 cursor-not-allowed'
            : isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-accent'
        )}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{item.label}</span>
        {isDisabled && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            em breve
          </Badge>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile Header */}
      <header
        className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between h-14 px-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-xs p-0 flex flex-col">
                <div className="flex flex-col h-full">
                  {/* Drawer Header */}
                  <div
                    className="p-4 border-b border-border flex items-center gap-2"
                    style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
                  >
                    <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                      <Settings className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="font-semibold">Admin</span>
                  </div>

                  {/* Back to App */}
                  <div className="p-2 border-b border-border">
                    <NavLink to="/" onClick={() => setOpen(false)}>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-muted-foreground"
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar ao App
                      </Button>
                    </NavLink>
                  </div>

                  {/* Menu Items */}
                  <ScrollArea className="flex-1">
                    <nav className="p-2 space-y-1">
                      {fixedItems.map(renderMenuItem)}

                      <div className="pt-3 pb-1">
                        <Separator />
                      </div>

                      <Accordion
                        type="multiple"
                        defaultValue={activeGroupId ? [activeGroupId] : []}
                        className="w-full"
                      >
                        {menuGroups.map((group) => {
                          const GroupIcon = group.icon;
                          return (
                            <AccordionItem
                              key={group.id}
                              value={group.id}
                              className="border-none"
                            >
                              <AccordionTrigger className="px-3 py-3 rounded-lg text-sm font-medium hover:bg-accent hover:no-underline">
                                <span className="flex items-center gap-3">
                                  <GroupIcon className="h-5 w-5 flex-shrink-0" />
                                  <span>{group.label}</span>
                                </span>
                              </AccordionTrigger>
                              <AccordionContent className="pb-1 pt-1">
                                <div className="pl-3 space-y-1 border-l border-border ml-4">
                                  {group.items.map(renderMenuItem)}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </nav>
                  </ScrollArea>

                  {/* Footer */}
                  <div
                    className="p-4 border-t border-border"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
                  >
                    <p className="text-xs text-muted-foreground text-center">
                      Admin v1.0
                    </p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2 min-w-0">
              {currentSection && (
                <>
                  <currentSection.icon className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-semibold truncate">{currentSection.label}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
        {children}
      </main>
    </div>
  );
}
