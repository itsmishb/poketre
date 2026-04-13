import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "ログイン | カード管理システム",
};

export default async function LoginPage() {
  if (isDemoMode) {
    return (
      <div className="mt-4 space-y-4">
        <p className="rounded bg-amber-100 p-3 text-center text-sm text-amber-900">
          デモモードです。Supabase 未接続のため、下のボタンからダッシュボードへ進んで画面を確認できます。
        </p>
        <Link
          href="/"
          className="block w-full rounded bg-blue-600 px-4 py-2 text-center font-medium text-white hover:bg-blue-700"
        >
          ダッシュボードへ進む
        </Link>
      </div>
    );
  }

  try {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        redirect("/");
      }
    }
  } catch {
    // Supabase 到達不可時もログインフォームを表示
  }

  return (
    <div className="mt-4">
      <LoginForm />
    </div>
  );
}
