import { useEffect } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { useRouter } from 'next/router';

export default function Callback() {
  const router = useRouter();
  useEffect(() => {
    getCurrentUser()
      .then(user => {
        console.log("Logged in!", user);
        router.push('/');
      })
      .catch(err => {
        console.error("Auth error", err);
      });
  }, []);

  return <p>Logging in...</p>;
}
