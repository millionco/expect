import http from "node:http";
import type { AddressInfo } from "node:net";

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Acme App</title></head>
<body>
  <h1>Welcome to Acme</h1>
  <p>Your dashboard for everything.</p>
  <nav>
    <a href="/login">Login</a>
    <a href="/signup">Signup</a>
  </nav>
</body>
</html>`;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Login - Acme</title></head>
<body>
  <h1>Sign in to Acme</h1>
  <form id="login-form">
    <div>
      <label for="email">Email</label>
      <input id="email" type="email" required placeholder="you@example.com" />
      <span class="error" id="email-error" style="display:none;color:red">Email is required</span>
    </div>
    <div>
      <label for="password">Password</label>
      <input id="password" type="password" required placeholder="••••••••" />
      <span class="error" id="password-error" style="display:none;color:red">Password is required</span>
    </div>
    <button type="submit">Sign in</button>
  </form>
  <div id="server-error" style="display:none;color:red">Invalid email or password</div>
  <p>Don't have an account? <a href="/signup">Sign up</a></p>
  <script>
    document.getElementById('login-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;
      var hasError = false;
      if (!email) { document.getElementById('email-error').style.display = 'block'; hasError = true; }
      else { document.getElementById('email-error').style.display = 'none'; }
      if (!password) { document.getElementById('password-error').style.display = 'block'; hasError = true; }
      else { document.getElementById('password-error').style.display = 'none'; }
      if (hasError) return;
      document.getElementById('server-error').style.display = 'block';
    });
  </script>
</body>
</html>`;

const SIGNUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Signup - Acme</title></head>
<body>
  <h1>Create an account</h1>
  <form id="signup-form">
    <div>
      <label for="email">Email</label>
      <input id="email" type="email" required />
    </div>
    <div>
      <label for="password">Password</label>
      <input id="password" type="password" required />
    </div>
    <div>
      <label for="confirm">Confirm Password</label>
      <input id="confirm" type="password" required />
    </div>
    <button type="submit">Create account</button>
    <span id="match-error" style="display:none;color:red">Passwords do not match</span>
  </form>
  <p>Already have an account? <a href="/login">Sign in</a></p>
  <script>
    document.getElementById('signup-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var pw = document.getElementById('password').value;
      var confirm = document.getElementById('confirm').value;
      if (pw !== confirm) {
        document.getElementById('match-error').style.display = 'block';
      } else {
        document.getElementById('match-error').style.display = 'none';
      }
    });
  </script>
</body>
</html>`;

const PAGES: Record<string, string> = {
  "/": INDEX_HTML,
  "/login": LOGIN_HTML,
  "/signup": SIGNUP_HTML,
};

export const startFixtureServer = (): Promise<{ url: string; close: () => Promise<void> }> =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const page = PAGES[req.url ?? "/"] ?? INDEX_HTML;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(page);
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${port}`;
      const close = () => new Promise<void>((done) => server.close(() => done()));
      resolve({ url, close });
    });
  });
