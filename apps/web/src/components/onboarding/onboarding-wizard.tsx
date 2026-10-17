import { FIELD_MAX_LENGTH, slugify } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { NewPasswordFields, readNewPassword } from "@/components/account/new-password-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import i18n, { changeLanguage, readStoredLanguage } from "@/i18n";
import { isLanguage } from "@/i18n/languages";
import { api } from "@/lib/api";
import { sessionQuery } from "@/lib/auth";

import { ApiRequestError, ensureOk, errorMessage } from "@/lib/errors";
import { removeUserQueries } from "@/lib/query-client";

type Step = "profile" | "band" | "instrument" | "password" | "review";

type Values = {
  firstName: string;
  lastName: string;
  nickname: string;
  instrument: string;
  bandName: string;
  genre: string;
  password: string;
};

const EMPTY: Values = {
  firstName: "",
  lastName: "",
  nickname: "",
  instrument: "",
  bandName: "",
  genre: "",
  password: "",
};

/** Steps of each path: band leaders create a band (#23), musicians join one (#7). */
function stepsFor(joining: boolean, newAccount: boolean): Step[] {
  if (joining) {
    return newAccount ? ["profile", "password", "review"] : ["instrument", "review"];
  }
  return newAccount ? ["profile", "band", "password", "review"] : ["band", "review"];
}

/**
 * Onboarding from an invitation. Nothing is created until the last step: then the account (for a
 * new user) and the membership (with the band, for a band leader) are created together, and the
 * user lands on the band. Someone who already has an account (and is logged in) only fills in the
 * band, or their instrument in the band they join.
 */
export function OnboardingWizard({
  token,
  email,
  inviterName,
  joining,
  newAccount,
}: {
  token: string;
  email: string;
  inviterName: string;
  /** Name of the band a musician joins; null for a band leader, who creates one. */
  joining: string | null;
  newAccount: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const steps = stepsFor(joining !== null, newAccount);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Values>(EMPTY);
  const [bandError, setBandError] = useState<string | null>(null);
  const step = steps[index] ?? "review";

  const set = (field: keyof Values) => (value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }));
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  const checkBandName = useMutation({
    mutationFn: async (name: string) =>
      (
        await (
          await ensureOk(
            await api.invitations[":token"]["band-name"].$get({
              param: { token },
              query: { name },
            }),
          )
        ).json()
      ).available,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { firstName, lastName, nickname, instrument, bandName, genre, password } = values;
      const res = await api.invitations[":token"].accept.$post({
        param: { token },
        json: {
          instrument,
          ...(joining === null ? { bandName, genre: genre || undefined } : {}),
          newAccount: newAccount
            ? { firstName, lastName, nickname: nickname || undefined, password }
            : undefined,
        },
      });
      return (await (await ensureOk(res)).json()).bandSlug;
    },
    onSuccess: async (bandSlug) => {
      // Keep the language the wizard was shown in (the invitation's) on this device.
      const current = i18n.resolvedLanguage;
      if (!readStoredLanguage() && isLanguage(current)) {
        await changeLanguage(current);
      }
      // Logged in (a new account) or with a new band: forget anything cached for a previous user.
      removeUserQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
      await navigate({ to: "/b/$bandSlug", params: { bandSlug } });
    },
    onError: (error) => {
      // Someone took the name meanwhile: back to the band step to pick another.
      if (error instanceof ApiRequestError && error.code === "band_name_taken") {
        setBandError(t("errors.band_name_taken"));
        setIndex(steps.indexOf("band"));
      }
    },
  });

  async function onBandSubmit() {
    setBandError(null);
    try {
      if (await checkBandName.mutateAsync(values.bandName.trim())) {
        next();
      } else {
        setBandError(t("errors.band_name_taken"));
      }
    } catch (error) {
      setBandError(errorMessage(t, error));
    }
  }

  return (
    <Card className="mx-auto mt-4 max-w-md">
      <CardHeader>
        <p className="text-muted-foreground text-xs">
          {t("invite.step", { current: index + 1, total: steps.length })}
        </p>
        <CardTitle className="font-heading text-xl">{t(`invite.steps.${step}`)}</CardTitle>
        {index === 0 && (
          <CardDescription>
            {joining === null
              ? t("invite.intro", { inviter: inviterName })
              : t("invite.join.intro", { inviter: inviterName, band: joining })}
          </CardDescription>
        )}
      </CardHeader>

      {step === "profile" && (
        <StepForm onSubmit={next} onBack={null}>
          <Field label={t("invite.firstName")}>
            {(id) => (
              <Input
                id={id}
                value={values.firstName}
                onChange={(e) => set("firstName")(e.target.value)}
                autoComplete="given-name"
                maxLength={FIELD_MAX_LENGTH.firstName}
                required
                autoFocus
              />
            )}
          </Field>
          <Field label={t("invite.lastName")}>
            {(id) => (
              <Input
                id={id}
                value={values.lastName}
                onChange={(e) => set("lastName")(e.target.value)}
                autoComplete="family-name"
                maxLength={FIELD_MAX_LENGTH.lastName}
                required
              />
            )}
          </Field>
          <Field label={t("invite.nickname")} hint={t("invite.nicknameHint")}>
            {(id) => (
              <Input
                id={id}
                value={values.nickname}
                onChange={(e) => set("nickname")(e.target.value)}
                autoComplete="nickname"
                maxLength={FIELD_MAX_LENGTH.nickname}
              />
            )}
          </Field>
          <InstrumentField value={values.instrument} onChange={set("instrument")} />
        </StepForm>
      )}

      {step === "band" && (
        <StepForm
          onSubmit={onBandSubmit}
          onBack={index > 0 ? back : null}
          pending={checkBandName.isPending}
        >
          <Field
            label={t("invite.bandName")}
            hint={[
              t("invite.bandNameHint"),
              values.bandName.trim() ? t("invite.bandUrl", { slug: slugify(values.bandName) }) : "",
            ]
              .filter(Boolean)
              .join(" ")}
            error={bandError}
          >
            {(id) => (
              <Input
                id={id}
                value={values.bandName}
                onChange={(e) => {
                  set("bandName")(e.target.value);
                  setBandError(null);
                }}
                autoComplete="off"
                maxLength={FIELD_MAX_LENGTH.bandName}
                required
                autoFocus
                aria-invalid={bandError ? true : undefined}
              />
            )}
          </Field>
          <SuggestField
            label={t("invite.genre")}
            hint={t("invite.genreHint")}
            suggestions={t("invite.genreSuggestions")}
            value={values.genre}
            onChange={set("genre")}
            maxLength={FIELD_MAX_LENGTH.genre}
          />
          {/* Someone with an account fills their instrument for this band here. */}
          {!newAccount && (
            <InstrumentField value={values.instrument} onChange={set("instrument")} />
          )}
        </StepForm>
      )}

      {step === "instrument" && (
        <StepForm onSubmit={next} onBack={null}>
          <InstrumentField value={values.instrument} onChange={set("instrument")} />
        </StepForm>
      )}

      {step === "password" && (
        <PasswordStep
          password={values.password}
          onDone={(password) => {
            set("password")(password);
            next();
          }}
          onBack={back}
        />
      )}

      {step === "review" && (
        <StepForm
          onSubmit={() => create.mutate()}
          onBack={back}
          pending={create.isPending}
          submitLabel={
            joining === null
              ? create.isPending
                ? t("invite.creating")
                : t("invite.create")
              : create.isPending
                ? t("invite.join.submitting")
                : t("invite.join.submit")
          }
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <ReviewRow label={t("invite.email")} value={email} />
            {newAccount && (
              <>
                <ReviewRow
                  label={t("invite.name")}
                  value={`${values.firstName} ${values.lastName}`}
                />
                <ReviewRow
                  label={t("invite.nickname")}
                  value={values.nickname || t("invite.none")}
                />
              </>
            )}
            <ReviewRow label={t("invite.instrument")} value={values.instrument} />
            <ReviewRow label={t("invite.band")} value={joining ?? values.bandName} />
            {joining === null && (
              <ReviewRow label={t("invite.genre")} value={values.genre || t("invite.none")} />
            )}
          </dl>
          {create.isError &&
            !(
              create.error instanceof ApiRequestError && create.error.code === "band_name_taken"
            ) && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage(t, create.error)}
              </p>
            )}
        </StepForm>
      )}
    </Card>
  );
}

function StepForm({
  onSubmit,
  onBack,
  pending = false,
  submitLabel,
  children,
}: {
  onSubmit: (form: HTMLFormElement) => void;
  onBack: (() => void) | null;
  pending?: boolean;
  submitLabel?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit(event.currentTarget);
      }}
    >
      <CardContent className="space-y-4">{children}</CardContent>
      <CardFooter className="mt-6 flex-row-reverse justify-between gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel ?? (pending ? t("invite.checking") : t("invite.next"))}
        </Button>
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
            {t("invite.back")}
          </Button>
        )}
      </CardFooter>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | null;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}

/** Free text with suggestions (a datalist): instruments and genres vary too much for a list. */
function SuggestField({
  label,
  hint,
  suggestions,
  value,
  onChange,
  maxLength,
  required = false,
}: {
  label: string;
  hint: string;
  suggestions: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  required?: boolean;
}) {
  const listId = useId();
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <>
          <Input
            id={id}
            list={listId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            maxLength={maxLength}
            required={required}
          />
          <datalist id={listId}>
            {suggestions.split(",").map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </>
      )}
    </Field>
  );
}

function InstrumentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <SuggestField
      label={t("invite.instrument")}
      hint={t("invite.instrumentHint")}
      suggestions={t("invite.instrumentSuggestions")}
      value={value}
      onChange={onChange}
      maxLength={FIELD_MAX_LENGTH.instrument}
      required
    />
  );
}

function PasswordStep({
  password,
  onDone,
  onBack,
}: {
  password: string;
  onDone: (password: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [mismatch, setMismatch] = useState(false);

  return (
    <StepForm
      onSubmit={(form) => {
        const value = readNewPassword(new FormData(form));
        if (value === null) {
          setMismatch(true);
        } else {
          onDone(value);
        }
      }}
      onBack={onBack}
    >
      <NewPasswordFields
        mismatch={mismatch}
        onChange={() => setMismatch(false)}
        defaultValue={password}
        labels={{ password: t("invite.password"), confirm: t("invite.confirmPassword") }}
        autoFocus
      />
    </StepForm>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </>
  );
}
