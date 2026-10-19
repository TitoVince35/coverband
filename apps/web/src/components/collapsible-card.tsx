import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A card whose content opens and closes from its title (an accordion block of the song page): a
 * title button with `aria-expanded`. Its actions go in the content, so they hide with it.
 */
export function CollapsibleCard({
  title,
  defaultOpen,
  children,
  className,
}: {
  title: string;
  /** Open at first; a function is read once (the screen's width, say). */
  defaultOpen: boolean | (() => boolean);
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => setOpen(!open)}
            className="flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex-1">{title}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-5 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent id={contentId} hidden={!open}>
        {children}
      </CardContent>
    </Card>
  );
}
