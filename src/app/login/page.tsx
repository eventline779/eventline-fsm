"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("E-Mail oder Passwort ist falsch.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/passwort-reset`,
    });

    if (error) {
      setError("Fehler: " + error.message);
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-white border-0 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mb-4 flex justify-center">
            <Logo size="lg" variant="dark" />
          </div>
          <p className="text-sm text-gray-500">
            Field Service Management
          </p>
        </CardHeader>
        <CardContent>
          {resetMode ? (
            resetSent ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="font-semibold text-lg">E-Mail gesendet!</h3>
                <p className="text-sm text-gray-500 mt-2">
                  Prüfe dein Postfach bei <strong>{email}</strong>. Klicke auf den Link in der E-Mail um dein Passwort zurückzusetzen.
                </p>
                <Button
                  onClick={() => { setResetMode(false); setResetSent(false); }}
                  variant="outline"
                  className="mt-6"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück zum Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="text-center mb-2">
                  <h3 className="font-semibold">Passwort zurücksetzen</h3>
                  <p className="text-sm text-gray-500 mt-1">Gib deine E-Mail-Adresse ein</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">E-Mail</Label>
                  <Input
                    id="resetEmail"
                    type="email"
                    placeholder="name@eventline-basel.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  disabled={loading}
                >
                  {loading ? "Senden..." : "Link senden"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setResetMode(false); setError(""); }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 mt-2"
                >
                  Zurück zum Login
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@eventline-basel.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Passwort eingeben"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white"
                disabled={loading}
              >
                {loading ? "Anmelden..." : "Anmelden"}
              </Button>
              <button
                type="button"
                onClick={() => { setResetMode(true); setError(""); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Passwort vergessen?
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
