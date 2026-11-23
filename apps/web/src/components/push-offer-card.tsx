import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEnablePush } from "@/components/account/push-card";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInstalled } from "@/lib/install";
import { useOnline } from "@/lib/online";
import { pushKeyQuery, pushStateQuery } from "@/lib/push";
import { dismissPushOffer, pushOfferDismissed, showPushOffer } from "@/lib/push-offer";

/**
 * Offers to turn notifications on (#353), on the home page of the installed app, until they're on
 * or the card is dismissed. The account page's card stays the place to turn them on or off.
 */
export function PushOfferCard() {
  const { t } = useTranslation();
  const online = useOnline();
  const installed = useInstalled();
  const [dismissed, setDismissed] = useState(pushOfferDismissed);
  const { data: publicKey } = useQuery(pushKeyQuery);
  const { data: state } = useQuery(pushStateQuery);
  const enable = useEnablePush();

  // No key: push is off on the server.
  if (!publicKey || !showPushOffer({ installed, dismissed, state })) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("pushOffer.title")}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("pushOffer.dismiss")}
            onClick={() => {
              dismissPushOffer();
              setDismissed(true);
            }}
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{t("account.push.description")}</p>
        <Button
          className="w-full"
          disabled={!online}
          pending={enable.isPending}
          onClick={() => enable.mutate(publicKey)}
        >
          <Bell />
          {t("account.push.enable")}
        </Button>
        <p className="text-muted-foreground text-xs">
          {t("pushOffer.later")}{" "}
          <Link to="/account" className="underline underline-offset-4">
            {t("pushOffer.account")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
