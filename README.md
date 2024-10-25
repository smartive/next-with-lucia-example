# Next.js OIDC Authentication Example
This repository provides an example implementation of OIDC authentication for Next.js App Router applications, focusing on server-side session management, token refreshing, and seamless client-server state synchronization.

This example is discussed in detail in the blog post: [Implementing OIDC Authentication in Next.js App Router](https://smartive.ch/blog/a-better-way-to-authenticate-oidc-in-next-js-with-lucia-auth) — Please refer to the post for an in-depth explanation of the concepts, challenges, and code examples.


## Setup

### 1. Google Cloud Console Configuration
To use this example, set up an OIDC client with Google:

1. Go to the Google Cloud Console.
2. Create a new project (or select an existing one).
3. Navigate to APIs & Services > OAuth consent screen and configure your consent screen.
4. Go to Credentials > Create Credentials > OAuth 2.0 Client IDs.
5. Choose Web application as the application type.
6. Under Authorized redirect URIs, add: http://localhost:3000/api/auth/callback
7. Save the credentials and note down the Client ID and Client Secret.

### 2. Environment Variables
Create a .env.local file in the root of the repository and add the following variables:

```env
OIDC_LOGIN_URL=https://accounts.google.com
OIDC_CLIENT_ID=your-google-client-id
OIDC_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_FULL_APP_URL=http://localhost:3000
```
Replace your-google-client-id and your-google-client-secret with the credentials obtained from the Google Cloud Console.

### 3. Start Application

run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

