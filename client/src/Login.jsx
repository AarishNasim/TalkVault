/* eslint-disable no-unused-vars */
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FaFacebookF, FaGoogle } from 'react-icons/fa';
import { signInWithPopup } from 'firebase/auth';
import { auth, facebookProvider, googleProvider } from './firebaseConfig';

function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSocialLoading, setIsSocialLoading] = useState('');
  
  const navigate = useNavigate(); 

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    const isEmailVerification = window.location.pathname.includes('verify-email');
    if (!token || !isEmailVerification) return;

    fetch(`http://localhost:5000/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setMessage(data.message);
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('http://localhost:5000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userEmail', data.user.email);
        localStorage.setItem('userName', data.user.name);
        localStorage.setItem('talkvault_user', JSON.stringify(data.user));
        navigate('/dashboard'); 
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Server se connect nahi ho paya. Backend chalu hai?");
    }
  };

  const completeFirebaseLogin = async (result) => {
    const { user } = result;
    const firebaseToken = await user.getIdToken();
    const profile = {
      id: user.uid || user.email || 'firebase-user',
      name: user.displayName || user.email?.split('@')[0] || 'TalkVault user',
      username: user.displayName || user.email?.split('@')[0] || 'TalkVault user',
      email: user.email || '',
      phone: user.phoneNumber || ''
    };
    localStorage.setItem('firebaseToken', firebaseToken);
    localStorage.setItem('token', firebaseToken);
    localStorage.setItem('userEmail', profile.email);
    localStorage.setItem('userName', profile.name);
    localStorage.setItem('talkvault_user', JSON.stringify(profile));
    navigate('/dashboard');
  };

  const getSocialLoginError = (provider, loginError) => {
    console.error(`${provider} sign-in failed`, loginError);

    switch (loginError.code) {
      case 'auth/account-exists-with-different-credential':
        return loginError.customData?.email
          ? `${loginError.customData.email} is already registered with another sign-in method. Use that method first, then link ${provider}.`
          : `This email is already registered with another sign-in method. Use that method first, then link ${provider}.`;
      case 'auth/popup-closed-by-user':
        return `${provider} sign-in was cancelled.`;
      case 'auth/popup-blocked':
        return 'Your browser blocked the sign-in popup. Allow popups for TalkVault and try again.';
      case 'auth/cancelled-popup-request':
        return 'Another sign-in popup is already open.';
      case 'auth/operation-not-allowed':
        return `${provider} sign-in is not enabled in Firebase Authentication.`;
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized in Firebase Authentication settings.';
      case 'auth/network-request-failed':
        return 'Network error while connecting to Firebase. Check your connection and try again.';
      case 'auth/invalid-api-key':
        return 'Firebase configuration is invalid. Check the VITE_FIREBASE_* values.';
      default:
        return loginError.message || `${provider} sign-in failed. Please try again.`;
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setMessage('');
    if (!auth) {
      setError('Firebase is not configured yet. Add your VITE_FIREBASE_* values to client/.env.local.');
      return;
    }
    setIsSocialLoading('google');
    try {
      await completeFirebaseLogin(await signInWithPopup(auth, googleProvider));
    } catch (loginError) {
      setError(getSocialLoginError('Google', loginError));
    } finally {
      setIsSocialLoading('');
    }
  };

  const handleFacebookLogin = async () => {
    setError('');
    setMessage('');
    if (!auth) {
      setError('Firebase is not configured yet. Add your VITE_FIREBASE_* values to client/.env.local.');
      return;
    }
    setIsSocialLoading('facebook');
    try {
      await completeFirebaseLogin(await signInWithPopup(auth, facebookProvider));
    } catch (loginError) {
      setError(getSocialLoginError('Facebook', loginError));
    } finally {
      setIsSocialLoading('');
    }
  };

  return (
    <div className="min-h-screen bg-[#090b10] flex items-center justify-center px-4 py-10 font-sans text-[#f5f7fb] relative overflow-hidden">
      <div className="absolute top-[-12rem] left-[-8rem] w-[28rem] h-[28rem] rounded-full bg-[#1b4d77]/30 blur-3xl"></div>
      <div className="absolute bottom-[-14rem] right-[-8rem] w-[30rem] h-[30rem] rounded-full bg-[#4b246d]/25 blur-3xl"></div>
      <div className="w-full max-w-[420px] relative z-10">
        <div className="bg-[#11151d]/95 border border-[#252d3a] px-8 py-9 shadow-2xl shadow-black/30 rounded-2xl">
          <div className="text-center mb-8">
            <img src="/talkvault-logo.svg" alt="TalkVault logo" className="mx-auto mb-4 w-16 h-16 rounded-2xl shadow-lg shadow-[#1e6fff]/20" />
            <h1 className="text-[34px] leading-none font-semibold tracking-[-0.02em] text-white">TalkVault</h1>
            <p className="text-[#8b96a8] text-sm mt-3">Speak clearly. Connect confidently.</p>
          </div>

        {error && (
          <div className="bg-[#391b24] border border-[#743343] text-[#ff9eae] text-xs p-3 mb-4 text-center rounded-lg">
            {error}
          </div>
        )}
        {message && <div className="bg-[#122b27] border border-[#246054] text-[#8de2cb] text-xs p-3 mb-4 text-center rounded-lg">{message}</div>}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button type="button" onClick={handleGoogleLogin} disabled={isSocialLoading !== ''} className="flex items-center justify-center gap-2 bg-white hover:bg-[#edf2f8] text-[#1a1d24] text-xs font-semibold py-3 rounded-lg transition disabled:opacity-60">
            <FaGoogle className="text-[#4285f4]" /> {isSocialLoading === 'google' ? 'Connecting...' : 'Google'}
          </button>
          <button type="button" onClick={handleFacebookLogin} disabled={isSocialLoading !== ''} className="flex items-center justify-center gap-2 bg-[#1877f2] hover:bg-[#2d84f3] text-white text-xs font-semibold py-3 rounded-lg transition disabled:opacity-60">
            <FaFacebookF /> {isSocialLoading === 'facebook' ? 'Connecting...' : 'Facebook'}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6 text-[#657084] text-[10px] font-semibold uppercase"><span className="h-px bg-[#293240] flex-1"></span><span>or continue with password</span><span className="h-px bg-[#293240] flex-1"></span></div>

        <form onSubmit={handleLogin} className="space-y-5 relative z-10">
          <div>
            <label className="block text-[11px] font-medium text-[#9ca8ba] mb-1.5">Username, email or phone</label>
            <input 
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#293240] text-white text-sm px-3.5 py-3.5 rounded-lg focus:outline-none focus:border-[#4d8dff] transition placeholder:text-[#586579]"
              placeholder="Enter your login ID"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#9ca8ba] mb-1.5">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#293240] text-white text-sm px-3.5 py-3.5 rounded-lg focus:outline-none focus:border-[#4d8dff] transition placeholder:text-[#586579]"
              placeholder="Enter your password"
            />
          </div>

          <button 
            type="submit" 
            className="w-full bg-[#1e6fff] hover:bg-[#3b82ff] text-white text-sm font-semibold py-3.5 rounded-lg transition"
          >
            LOG IN
          </button>
        </form>
        </div>

        <div className="text-center text-sm text-[#8995a7] mt-6">
          Don't have an account? <Link to="/register" className="text-[#62a0ff] font-semibold hover:text-white transition">Create new</Link>
        </div>
        <p className="text-center text-[11px] text-[#566174] mt-6">© 2026 TalkVault</p>
      </div>
    </div>
  );
}

export default Login;