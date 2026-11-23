import type { FarmingActionType } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Bug,
  Camera,
  CheckCircle2,
  Droplets,
  FlaskConical,
  PenLine,
  Scissors,
  Sprout,
  Wheat,
} from "lucide-react";
import { useState, type ReactNode } from "react";

export const Route = createFileRoute("/farming/logs")({
  component: FarmingLogsPage,
});

const FARMING_ACTIONS: readonly {
  readonly value: FarmingActionType;
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  {
    value: "seeding",
    label: "Gieo hạt",
    icon: <Sprout className="size-6" aria-hidden="true" />,
  },
  {
    value: "watering",
    label: "Tưới nước",
    icon: <Droplets className="size-6" aria-hidden="true" />,
  },
  {
    value: "bio_fertilizing",
    label: "Bón phân hữu cơ",
    icon: <Wheat className="size-6" aria-hidden="true" />,
  },
  {
    value: "weeding",
    label: "Làm cỏ",
    icon: <Scissors className="size-6" aria-hidden="true" />,
  },
  {
    value: "pest_control",
    label: "Phòng trừ sâu",
    icon: <Bug className="size-6" aria-hidden="true" />,
  },
  {
    value: "soil_testing",
    label: "Kiểm định đất",
    icon: <FlaskConical className="size-6" aria-hidden="true" />,
  },
  {
    value: "harvesting",
    label: "Thu hoạch",
    icon: <Wheat className="size-6" aria-hidden="true" />,
  },
  {
    value: "correction",
    label: "Ghi chú đính chính",
    icon: <PenLine className="size-6" aria-hidden="true" />,
  },
];

function FarmingLogsPage() {
  const [season, setSeason] = useState("SEASON-2026-A1");
  const [action, setAction] = useState<FarmingActionType>("watering");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{
    readonly variant: "destructive" | "success" | "default";
    readonly message: string;
  } | null>(null);

  function handleSave() {
    if (!note.trim()) {
      setFeedback({
        variant: "destructive",
        message: "Vui lòng nhập mô tả ngắn trước khi ghi nhật ký.",
      });
      return;
    }
    setFeedback({
      variant: "success",
      message: `Đã ghi nhật ký [${action}] cho ${season} (Append-only)`,
    });
    setNote("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-gray-900">
            Ghi Nhật Ký Canh Tác
          </h1>
          <p className="text-xs text-gray-500">
            BO-02 · Bản ghi bất biến (Append-only)
          </p>
        </div>
        <Badge variant="secondary">VietGAP</Badge>
      </div>

      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-gray-800">
            1. Chọn mùa vụ &amp; lô đất
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={season} onValueChange={(v) => v && setSeason(v)}>
            <SelectTrigger
              aria-label="Chọn mùa vụ và lô đất"
              className="min-h-12 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SEASON-2026-A1">
                Lô A1 · Cải ngọt hữu cơ (Đang canh tác)
              </SelectItem>
              <SelectItem value="SEASON-2026-B2">
                Lô B2 · Cà chua bi (Đang canh tác)
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-gray-800">
            2. Chọn hành động (Lưới 2×4 chạm lớn)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2.5">
            {FARMING_ACTIONS.map((item) => {
              const selected = action === item.value;
              return (
                <Button
                  key={item.value}
                  type="button"
                  variant="outline"
                  aria-pressed={selected}
                  onClick={() => setAction(item.value)}
                  className={cn(
                    "h-auto min-h-16 flex-col gap-1.5 rounded-xl p-3 text-xs font-bold whitespace-normal",
                    selected
                      ? "border-brand-forest bg-accent text-brand-forest hover:bg-accent hover:text-brand-forest"
                      : "border-border-subtle bg-surface-card text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {item.icon}
                  <span className="text-center leading-tight">
                    {item.label}
                  </span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-gray-800">
            3. Mô tả &amp; ảnh hiện trường
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="farming-log-note" className="sr-only">
            Mô tả chi tiết công việc canh tác
          </Label>
          <Textarea
            id="farming-log-note"
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (feedback) {
                setFeedback(null);
              }
            }}
            placeholder="Ví dụ: Tưới nhỏ giọt lúc 5h sáng, độ ẩm đất đạt chuẩn..."
            className="min-h-20 rounded-xl border-border-subtle bg-surface-card p-3 text-sm"
          />
          {feedback ? (
            <Alert
              variant={feedback.variant}
              role={feedback.variant === "destructive" ? "alert" : "status"}
            >
              {feedback.variant === "success" ? (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              ) : (
                <AlertCircle className="size-4" aria-hidden="true" />
              )}
              <AlertDescription className="text-xs">
                {feedback.message}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setFeedback({
                variant: "default",
                message: "Upload ảnh Cloudinary sẽ nối ở bước API.",
              })
            }
            className="min-h-12 w-full gap-2"
          >
            <Camera className="size-5" aria-hidden="true" />
            <span>Chụp / chọn 1–3 ảnh thực tế</span>
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="min-h-12 w-full font-bold"
          >
            Lưu nhật ký bất biến
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
