"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  buttonVariants,
} from "@greenroots/ui";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { isSafeExternalCertUrl } from "@/features/traceability/utils/trace-mapper";

interface VietGapDialogButtonProps {
  readonly farmName: string;
  readonly legalName: string;
  readonly address: string;
  readonly certificationUrl: string;
}

/**
 * Trigger button and modal dialog displaying real farm provenance and certification link.
 *
 * @param props Farm legal metadata and external VietGAP certificate URL.
 * @returns Interactive dialog trigger matching the `/trace/[batchCode]` header CTA.
 */
export function VietGapDialogButton({
  farmName,
  legalName,
  address,
  certificationUrl,
}: VietGapDialogButtonProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-auto shrink-0 self-start rounded-full border-brand-forest bg-surface-warm px-6 py-2.5 text-sm font-semibold text-brand-dark hover:bg-green-50 lg:self-center"
          />
        }
      >
        <ShieldCheck className="size-4" aria-hidden="true" />
        Chứng nhận VietGAP
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">
            Chứng nhận VietGAP
          </DialogTitle>
          <DialogDescription className="text-[13px] text-gray-500">
            Thông tin pháp nhân và hồ sơ chứng nhận thực hành nông nghiệp tốt
            được lưu trữ trên hệ thống.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border-subtle border-y border-border-subtle text-[13px]">
          <div className="flex justify-between gap-4 py-2.5">
            <span className="text-gray-500">Đơn vị được cấp</span>
            <span className="text-right font-semibold text-gray-900">
              {legalName}
            </span>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <span className="text-gray-500">Trang trại</span>
            <span className="text-right font-semibold text-gray-900">
              {farmName}
            </span>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <span className="text-gray-500">Địa chỉ canh tác</span>
            <span className="text-right font-semibold text-gray-900">
              {address}
            </span>
          </div>
        </div>

        {isSafeExternalCertUrl(certificationUrl) ? (
          <DialogFooter>
            <a
              href={certificationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                className:
                  "w-full rounded bg-brand-forest text-sm font-semibold text-white hover:bg-brand-dark",
              })}
            >
              Mở hồ sơ chứng nhận gốc
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
