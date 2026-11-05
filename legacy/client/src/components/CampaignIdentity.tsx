import React from "react";

export function CampaignIdentity({
  name,
  campaignId,
  nameClassName = "font-medium text-slate-300",
  idClassName = "mt-0.5",
}: {
  name: string;
  campaignId: string;
  nameClassName?: string;
  idClassName?: string;
}) {
  return (
    <>
      <p
        className={`break-words [overflow-wrap:anywhere] ${nameClassName}`}
        title={`${campaignId} • ${name}`}
      >
        {name}
      </p>
      <p className={`${idClassName} font-mono text-[9px] text-slate-700`}>
        ID {campaignId}
      </p>
    </>
  );
}
