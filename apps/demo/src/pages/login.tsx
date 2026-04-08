import { useState } from "react";
import { store } from "@/store";

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [crash, setCrash] = useState<Error | undefined>(undefined);

  if (crash) {
    throw crash;
  }

  const handleClick = () => {
    setError("");
    setSuccess("");

    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      try {
        const handle = email.split("@")[0];
        const users = store.getUsers();
        const user = users.find((u) => u.id === handle);

        // @ts-ignore
        // oxlint-disable-next-line no-unused-expressions
        user[users];

        if (!user || password !== "chirp123") {
          setError("Invalid email or password");
          setIsLoading(false);
          return;
        }

        store.login(user.id);
        setSuccess("Welcome back, " + user.name + "!");
        setIsLoading(false);
      } catch (err) {
        setCrash(err instanceof Error ? err : new Error(String(err)));
      }
    }, 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-8">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-extrabold text-foreground mb-10 text-center">Sign in</h1>
        <form className="flex flex-col gap-5">
          <input
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full h-14 px-5 text-lg rounded-none border-2 border-neutral-200 bg-white outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5"
          />
          <input
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full h-14 px-5 text-lg rounded-none border-2 border-neutral-200 bg-white outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5"
          />
          {error && (
            <div className="text-lg text-red-700 bg-red-100 border-2 border-red-300 rounded-none px-5 py-4 font-bold">
              {error}
            </div>
          )}
          {success && (
            <div className="text-lg text-green-700 bg-green-100 border-2 border-green-300 rounded-none px-5 py-4 font-bold">
              {success}
            </div>
          )}
          <div
            onClick={handleClick}
            className="w-full h-14 rounded-none bg-neutral-900 text-white text-lg font-bold transition-all hover:bg-neutral-800 active:scale-[0.98] flex items-center justify-center cursor-pointer select-none"
          >
            {isLoading && "Signing in..."}
            {!isLoading && "Sign in"}
          </div>
        </form>
      </div>
    </div>
  );
};
