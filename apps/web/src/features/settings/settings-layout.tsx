import { Outlet, useLocation } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { SettingsNav } from "@/features/settings/components/settings-nav";

export function SettingsLayout() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="mx-auto flex max-w-[1040px] flex-wrap items-start gap-x-10 gap-y-6 px-[clamp(14px,3vw,32px)] py-4.5 pb-16">
      <div className="sticky top-21 flex max-w-[220px] flex-1 basis-[180px] flex-col gap-3.5">
        <h1 className="px-2.5 text-[26px] font-semibold tracking-[-0.03em]">
          Settings
        </h1>
        <SettingsNav />
      </div>

      <div className="min-h-[calc(100svh-146px)] min-w-0 flex-[3_1_480px] pt-1">
        <Outlet />
      </div>
    </div>
  );
}
