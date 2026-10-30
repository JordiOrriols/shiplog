import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { WelcomeScreen, ProjectIcon } from "@jordiorriols/ui";
import { History, Lock, Megaphone } from "@jordiorriols/ui/icons";
import { LoginDialog } from "@/components/LoginDialog";
import { useData } from "@/data/DataProvider";

export function WelcomePage() {
  const { t } = useTranslation();
  const { authEnabled, authError, linkError } = useData();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [open, setOpen] = useState(false);
  return (
    <WelcomeScreen
      projectId="shiplog"
      brand={t("app.name")}
      icon={<ProjectIcon projectId="shiplog" />}
      title={t("welcome.title")}
      description={t("welcome.description")}
      features={[
        { icon: <History />, label: t("welcome.releases") },
        { icon: <Lock />, label: t("welcome.privacy") },
        { icon: <Megaphone />, label: t("welcome.portal") },
      ]}
      signInLabel={t("auth.signIn")}
      signUpLabel={t("auth.signUp")}
      disabled={!authEnabled}
      onSignIn={() => {
        setMode("signIn");
        setOpen(true);
      }}
      onSignUp={() => {
        setMode("signUp");
        setOpen(true);
      }}
      notice={
        <>
          {authError && <p role="alert">{authError}</p>}
          {linkError && (
            <p role="alert">{t("auth.linkFailed", { message: linkError })}</p>
          )}
          {!authEnabled && <p role="alert">{t("welcome.authUnavailable")}</p>}
        </>
      }
    >
      <LoginDialog
        isOpen={open}
        initialMode={mode}
        onClose={() => setOpen(false)}
      />
    </WelcomeScreen>
  );
}
