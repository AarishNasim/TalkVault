/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useRef} from 'react';
import { useNavigate } from 'react-router-dom';
import AgoraRTC from 'agora-rtc-sdk-ng';

function TalkVaultDashboard() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(() => {
    try {
      const storedUser = localStorage.getItem('talkvault_user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const loadProfile = async () => {
      const savedUser = localStorage.getItem('talkvault_user');
      if (savedUser) {
        try {
          setUserData(JSON.parse(savedUser));
        } catch {
          setUserData(null);
        }
      }

      const token = localStorage.getItem('token');
      if (!token) {
        if (!savedUser) {
          navigate('/');
        }
        return;
      }

      try {
        const response = await fetch('http://localhost:5000/me', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Unauthorized');
        }

        const data = await response.json();
        setUserData(data.user);
        localStorage.setItem('talkvault_user', JSON.stringify(data.user));
        localStorage.setItem('userEmail', data.user.email || '');
        localStorage.setItem('userName', data.user.name || data.user.username || 'TalkVault user');
      } catch (error) {
        if (!savedUser) {
          navigate('/');
          return;
        }
        const fallbackUser = JSON.parse(savedUser);
        setUserData(fallbackUser);
      }
    };

    loadProfile();
  }, [navigate]);
  
  // --- EXISTING SIDEBAR SYSTEM STATE ---
  const [activeTab, setActiveTab] = useState('Dashboard');

  // --- NEW: EXTENDED GAME SYSTEM STATES ---
  const [activeGame, setActiveGame] = useState('speedRun'); // 'speedRun', 'meaningMatcher', 'sentenceBuilder', 'grammarQuiz'
  const [gameStarted, setGameStarted] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [timer, setTimer] = useState(30);
  const [score, setScore] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // States for 2-Second Freeze and Answer Visuals
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isPausing, setIsPausing] = useState(false);

const [isCalling, setIsCalling] = useState(false);
const [agoraToken, setAgoraToken] = useState(null);
const agoraClientRef = useRef(null);
const localAudioTrackRef = useRef(null);

// Apni Agora App ID yahan bhi daal dein (Jo backend me use ki thi)
const AGORA_APP_ID = "YOUR_AGORA_APP_ID";

  // Final Answer Sheet Storage State
  const [userAnswersSheet, setUserAnswersSheet] = useState([]);

  // Multi-Game Database Arrays
  const GAMES_DATABASE = {
    speedRun: [
      { word: "Flamboyant", options: ["Dull", "Attracting attention / Exuberant", "Quiet", "Secretive"], correct: "Attracting attention / Exuberant" },
      { word: "Resilient", options: ["Weak", "Able to recover quickly / मजबूत", "Lazy", "Scared"], correct: "Able to recover quickly / मजबूत" },
      { word: "Eloquent", options: ["Fluent or persuasive speaker", "Poor writer", "Shy person", "Slow runner"], correct: "Fluent or persuasive speaker" },
      { word: "Meticulous", options: ["Careless", "Very careful and precise", "Always late", "Angry"], correct: "Very careful and precise" },
      { word: "Pragmatic", options: ["Dealing with things realistically", "Imaginary world", "Emotional", "Stubborn"], correct: "Dealing with things realistically" }
    ],
    meaningMatcher: [
      { word: "Abundant", options: ["Scarcity / कमी", "Plentiful / प्रचुर मात्रा में", "Rare / दुर्लभ", "Empty / खाली"], correct: "Plentiful / प्रचुर मात्रा में" },
      { word: "Reluctant", options: ["Willing / तैयार", "Unwilling / अनिच्छुक", "Eager / उत्सुक", "Happy / खुश"], correct: "Unwilling / अनिच्छुक" },
      { word: "Ambitious", options: ["Lazy / आलसी", "Determined / महत्वाकांक्षी", "Careless / लापरवाह", "Slow / धीमा"], correct: "Determined / महत्वाकांक्षी" },
      { word: "Meticulous", options: ["Rude behavior", "Fragile items", "Showing great attention to detail / अति सावधान", "Extremely lazy"], correct: "Showing great attention to detail / अति सावधान" },
      { word: "Pragmatic", options: ["Practical approach / व्यावहारिक", "Imaginary world", "Very emotional", "Always angry"], correct: "Practical approach / व्यावहारिक" }
    ],
    sentenceBuilder: [
      { jumbled: "english / speaks / fluently / he", options: ["He speaks english fluently.", "English he speaks fluently.", "Fluently he english speaks.", "Speaks he english fluently."], correct: "He speaks english fluently." },
      { jumbled: "hard / works / she / very", options: ["Hard she works very.", "She works very hard.", "Very hard she works.", "Works she very hard."], correct: "She works very hard." }
    ],
    grammarQuiz: [
      { question: "She ____ to the temple every day.", options: ["go", "goes", "going", "gone"], correct: "goes" },
      { question: "Neither of the plans ____ working.", options: ["is", "are", "were", "been"], correct: "is" }
    ]
  };

  // Get active array data dynamically
  const currentGameWords = GAMES_DATABASE[activeGame] || [];

  // --- NEW: GAME CONTROL FUNCTIONS ---
  const handleNextWord = useCallback(() => {
    setSelectedAnswer(null);
    setIsCorrect(null);
    setIsPausing(false);

    if (currentWordIndex < currentGameWords.length - 1) {
      setCurrentWordIndex((prev) => prev + 1);
      setTimer(30);
    } else {
      setGameStarted(false);
      setGameFinished(true); // Triggers final scorecard UI inside the panel
    }
  }, [currentWordIndex, currentGameWords.length]);

  // Call Start karne ka function
const startCall = async () => {
  try {
    setIsCalling(true);
    
    // 1. Ek random channel name/room name banao matching ke liye
    const channelName = "talkvault_global_room"; 

    // 2. Backend se Token fetch karo
    const response = await fetch(`http://localhost:5000/api/agora-token?channelName=${channelName}`);
    const data = await response.json();

    // 3. Agora Client create karo
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    agoraClientRef.current = client;

    // 4. Remote user join kare toh uska audio play karne ke liye event listener
    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "audio") {
        user.audioTrack.play();
      }
    });

    // 5. Channel join karo
    await client.join(AGORA_APP_ID, data.channelName, data.token, data.uid);

    // 6. Microphone access karke audio track banao aur publish karo
    const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localAudioTrackRef.current = localAudioTrack;
    await client.publish([localAudioTrack]);

    console.log("Call connected successfully!");
  } catch (error) {
    console.error("Failed to start call:", error);
    setIsCalling(false);
    alert("Call connect nahi ho payi. Please mic permission check karein.");
  }
};

// Call Cut/Disconnect karne ka function
const endCall = async () => {
  try {
    // Microphone band karo
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current.close();
    }
    // Channel leave karo
    if (agoraClientRef.current) {
      await agoraClientRef.current.leave();
    }
    setIsCalling(false);
    console.log("Call disconnected.");
  } catch (error) {
    console.error("Error ending call:", error);
  }
};

  const startGame = (gameKey) => {
    setActiveGame(gameKey);
    setGameStarted(true);
    setGameFinished(false);
    setTimer(30);
    setScore(0);
    setCurrentWordIndex(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setIsPausing(false);
    setUserAnswersSheet([]);
  };

  // Option Selection Handler with 2-Second Hold Rule
  const handleOptionClick = (option) => {
    if (isPausing) return;

    const currentItem = currentGameWords[currentWordIndex];
    const targetCorrect = currentItem.correct;

    setSelectedAnswer(option);
    setIsPausing(true);

    const checkCorrect = option === targetCorrect;
    setIsCorrect(checkCorrect);

    if (checkCorrect) {
      setScore((prev) => prev + 10);
    }

    // Save history data for the final answer sheet report card
    setUserAnswersSheet((prev) => [
      ...prev,
      {
        target: currentItem.word || currentItem.question || currentItem.jumbled,
        userSelection: option,
        correct: targetCorrect,
        status: checkCorrect ? "Correct" : "Incorrect"
      }
    ]);

    // Freeze screen display for exactly 2000ms
    setTimeout(() => {
      handleNextWord();
    }, 2000);
  };

  // --- NEW: AUTO TIMER TRIGGER EFFECT ---
  useEffect(() => {
    let interval = null;

    if (gameStarted && !isPausing) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            
            // Timeout recovery tracker insertion
            const currentItem = currentGameWords[currentWordIndex];
            setUserAnswersSheet((history) => [
              ...history,
              {
                target: currentItem.word || currentItem.question || currentItem.jumbled,
                userSelection: "TIMEOUT / No Answer",
                correct: currentItem.correct,
                status: "Incorrect"
              }
            ]);

            handleNextWord();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [gameStarted, isPausing, handleNextWord, currentWordIndex, currentGameWords]);

  // --- EXISTING LOGOUT SYSTEM ---
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('firebaseToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('talkvault_user');
    navigate('/');
  };

  // Helper function for rendering professional sidebar links dynamically
  const renderSidebarLink = (name, iconPath, badge = null) => {
    const isActive = activeTab === name;
    return (
      <a
        href="#"
        onClick={(e) => { e.preventDefault(); setActiveTab(name); }}
        className={`flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all duration-150 ${
          isActive
            ? 'text-white bg-gradient-to-r from-purple-600/30 to-indigo-600/10 shadow-[inset_4px_0_0_0_#a855f7]'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <div className="flex items-center gap-3">
          <svg className={`w-5 h-5 ${isActive ? 'text-purple-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath}></path>
          </svg>
          <span className="text-sm">{name}</span>
        </div>
        {badge && (
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-[10px] text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            {badge}
          </span>
        )}
      </a>
    );
  };

  const profileName = userData?.name || userData?.username || 'TalkVault user';
  const profileId = userData?.id ? userData.id.slice(-6).toUpperCase() : 'USER';
  const profileImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(profileName)}&background=6366f1&color=fff`;

  return (
    <div className="min-h-screen bg-[#0b1020] text-white font-sans px-0 py-0 md:px-4 md:py-4 xl:px-6 xl:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col overflow-hidden bg-[#0a0f1d] shadow-[0_30px_80px_rgba(15,23,42,0.65)] lg:max-h-[95vh] lg:flex-row lg:rounded-[32px] lg:border lg:border-white/10">
      
      {/* PROFESSIONAL SIDEBAR */}
      <aside className="w-full border-b border-gray-800 bg-[#111827] lg:w-72 lg:border-b-0 lg:border-r lg:shrink-0">
        
        {/* Brand Logo & Tagline */}
        <div className="p-6 border-b border-gray-800/50">
          <h1 className="text-2xl font-black bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent tracking-tight">
            TalkVault
          </h1>
          <p className="text-[10px] text-gray-500 font-medium tracking-widest uppercase mt-0.5">Speak Without Fear</p>
        </div>

        {/* User Profile Block */}
        <div className="mx-4 my-4 p-3 bg-[#171e2e] rounded-xl flex items-center gap-3 border border-gray-800/80 shadow-md">
          <div className="relative">
            <img src={profileImage} alt={profileName} className="w-10 h-10 rounded-full border border-indigo-500/50" />
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#111827] rounded-full"></span>
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold truncate">{profileName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.2 rounded border border-purple-500/30 font-medium">{userData?.username ? 'Member' : 'B2 Level'}</span>
              <span className="text-[10px] text-gray-400 font-mono">ID: {profileId}</span>
            </div>
          </div>
        </div>

        {/* Navigation Categories */}
        <nav className="flex-1 px-3 space-y-6 overflow-y-auto pb-28 custom-scrollbar">
          
          {/* Main Menu */}
          <div>
            <p className="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Core Panel</p>
            <div className="space-y-1">
              {renderSidebarLink('Home', 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6')}
              {renderSidebarLink('Dashboard', 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z')}
            </div>
          </div>

          {/* Practice Hub Systems */}
          <div>
            <p className="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Practice Hub</p>
            <div className="space-y-1">
              {renderSidebarLink('Voice Rooms', 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', 'LIVE')}
              {renderSidebarLink('Smart Chat AI', 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z')}
              {renderSidebarLink('Vocabulary Vault', 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', 'GAME')}
            </div>
          </div>

          {/* Performance Trackers */}
          <div>
            <p className="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Analytics</p>
            <div className="space-y-1">
              {renderSidebarLink('My Progress', 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z')}
              {renderSidebarLink('Settings', 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z')}
            </div>
          </div>

        </nav>

        {/* PREFERENCES & LOGOUT - Sticky Bottom */}
        <div className="absolute bottom-0 left-0 w-full px-4 py-4 bg-[#111827] border-t border-gray-800 flex flex-col gap-2">
          <div className="flex items-center justify-between px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 cursor-pointer transition">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              Support Online
            </span>
            <span className="underline">Get Help</span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-gray-400 hover:text-white hover:bg-red-500/10 rounded-xl transition-all duration-200 group"
          >
            <svg className="w-5 h-5 text-gray-500 group-hover:text-red-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="font-medium text-sm group-hover:text-red-400 transition-colors">Log Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="w-full flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
          <div>
            <h2 className="text-3xl font-black tracking-tight">
              {activeTab.toUpperCase()}
            </h2>
            <p className="text-sm text-gray-400 mt-1">Welcome back! Let's hit today's English learning goals.</p>
          </div>
          
          <div className="flex items-center gap-6 self-end sm:self-auto">
            <button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-full font-bold shadow-lg shadow-purple-500/30 transition transform hover:-translate-y-0.5">
              CALL NOW
            </button>
            <div className="flex gap-4">
              <svg className="w-6 h-6 text-gray-400 cursor-pointer hover:text-white transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              <div className="relative">
                <svg className="w-6 h-6 text-gray-400 cursor-pointer hover:text-white transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                <span className="absolute -top-1 -right-1 bg-red-500 w-2.5 h-2.5 rounded-full border-2 border-[#0a0f1d]"></span>
              </div>
            </div>
          </div>
        </header>

        {/* DYNAMIC HUB ROUTING ACCORDING TO ACTIVETAB */}
        {activeTab === 'Vocabulary Vault' ? (
          <div className="bg-[#151c33] border border-purple-500/30 rounded-3xl p-8 mb-8 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-500/10 blur-3xl rounded-full"></div>
            
            {/* Game Selector Tab System Inside Vault */}
            {!gameStarted && !gameFinished && (
              <div className="flex gap-2 mb-6 border-b border-gray-800 pb-4 overflow-x-auto">
                <button onClick={() => setActiveGame('speedRun')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${activeGame === 'speedRun' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}>🚀 SPEED RUN</button>
                <button onClick={() => setActiveGame('meaningMatcher')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${activeGame === 'meaningMatcher' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400'}`}>🧠 MEANING MATCH (HINDI/ENG)</button>
                <button onClick={() => setActiveGame('sentenceBuilder')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${activeGame === 'sentenceBuilder' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}>🏗️ SENTENCE BUILDER</button>
                <button onClick={() => setActiveGame('grammarQuiz')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${activeGame === 'grammarQuiz' ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400'}`}>📝 GRAMMAR QUIZ</button>
              </div>
            )}

            <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-6">
              <div>
                <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 uppercase tracking-wider">
                  {activeGame === 'speedRun' && "Vocabulary Speed Run"}
                  {activeGame === 'meaningMatcher' && "Word Meaning Matcher"}
                  {activeGame === 'sentenceBuilder' && "Sentence Builder Syntax"}
                  {activeGame === 'grammarQuiz' && "Grammar evaluation quiz"}
                </h3>
                <p className="text-xs text-gray-400">Choose the matching correct formula target parameter below.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-gray-800/80 px-4 py-2 rounded-xl text-center border border-gray-700">
                  <p className="text-[10px] text-gray-400 uppercase font-mono">Score</p>
                  <p className="text-lg font-black text-green-400">{score} XP</p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-center border transition-all ${timer <= 10 ? 'bg-red-500/20 border-red-500 animate-pulse' : 'bg-gray-800/80 border-gray-700'}`}>
                  <p className="text-[10px] text-gray-400 uppercase font-mono">Time Left</p>
                  <p className={`text-lg font-black ${timer <= 10 ? 'text-red-400' : 'text-cyan-400'}`}>{timer}s</p>
                </div>
              </div>
            </div>

            {/* SCREEN 1: READY SCREEN */}
            {!gameStarted && !gameFinished && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-purple-500/20">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <h4 className="text-lg font-bold">Ready to boost your evaluation status?</h4>
                <p className="text-sm text-gray-400 max-w-md mx-auto mt-1 mb-6">Test your agility. Complete all target objectives with side-by-side verification parameters.</p>
                <button
                  onClick={() => startGame(activeGame)}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 px-8 py-3 rounded-xl font-bold shadow-lg transition transform hover:-translate-y-0.5"
                >
                  START ACTIVE GAME NOW
                </button>
              </div>
            )}

            {/* SCREEN 2: ACTIVE PLAYGROUND */}
            {gameStarted && currentGameWords.length > 0 && (
              <div className="py-4">
                <div className="text-center mb-6">
                  <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-3 py-1 rounded-full font-mono font-bold uppercase tracking-widest">
                    Objective {currentWordIndex + 1} of {currentGameWords.length}
                  </span>
                  <h2 className="text-4xl font-black text-white tracking-tight mt-6 mb-2">
                    {currentGameWords[currentWordIndex].word || currentGameWords[currentWordIndex].question || currentGameWords[currentWordIndex].jumbled}
                  </h2>
                  <p className="text-xs text-gray-400 tracking-wider">CHOOSE THE ACCURATE DEFINITION PATHWAY BELOW:</p>
                </div>

                {/* Multiple Options Layout Section */}
                <div className="grid grid-cols-1 gap-3 max-w-2xl mx-auto mt-8">
                  {currentGameWords[currentWordIndex].options.map((option, idx) => {
                    let optionStyle = "border-gray-800 bg-white/5 text-gray-200 hover:border-purple-500 hover:bg-purple-950/20";
                    
                    // Style modifier for 2-second screen hold rule
                    if (isPausing) {
                      if (option === currentGameWords[currentWordIndex].correct) {
                        optionStyle = "border-green-500 bg-green-950/40 text-green-300 pointer-events-none";
                      } else if (selectedAnswer === option && !isCorrect) {
                        optionStyle = "border-red-500 bg-red-950/40 text-red-300 pointer-events-none";
                      } else {
                        optionStyle = "border-gray-800 bg-white/5 opacity-30 pointer-events-none";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isPausing}
                        onClick={() => handleOptionClick(option)}
                        className={`text-left p-4 rounded-xl border transition duration-150 flex items-center gap-3 font-medium text-sm ${optionStyle}`}
                      >
                        <span className="text-purple-400 font-bold">{idx + 1}.</span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Status validation flash during freeze */}
                {isPausing && (
                  <div className="text-center mt-6">
                    {isCorrect ? (
                      <span className="text-green-400 font-bold text-xs bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full">🎉 Absolute Core Correct. (Evaluating 2s)</span>
                    ) : (
                      <span className="text-red-400 font-bold text-xs bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">❌ structural Mismatch Detected. (Evaluating 2s)</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SCREEN 3: DETAILED COMPLIANT ANSWER SHEET */}
            {gameFinished && (
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 mt-4">
                <div className="text-center mb-6">
                  <span className="text-4xl">🏆</span>
                  <h3 className="text-xl font-bold mt-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">MODULE BREAKDOWN READY</h3>
                  <p className="text-xs text-gray-400 mt-1">Review your absolute score answers matrix sheet configuration below.</p>
                  <span className="inline-block bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm font-bold px-4 py-1.5 rounded-xl mt-3">Final Yield: {score} XP 🔥</span>
                </div>

                <hr className="border-gray-800 my-4" />

                <div className="space-y-3 max-w-xl mx-auto">
                  <h4 className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2">📋 COMPILATION REPORT SHEET :</h4>
                  
                  {userAnswersSheet.map((item, index) => (
                    <div key={index} className={`p-4 rounded-xl border text-xs ${item.status === 'Correct' ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                      <div className="flex justify-between items-center font-mono">
                        <span className="text-[10px] text-gray-500">OBJECTIVE STAGE #{index + 1}</span>
                        <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${item.status === 'Correct' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{item.status}</span>
                      </div>
                      <p className="font-bold text-sm mt-1.5 text-gray-200">{item.target}</p>
                      
                      <div className="mt-3 pt-2 border-t border-gray-800/60 grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-gray-500 block text-[10px]">Your Response:</span>
                          <span className={item.status === 'Correct' ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>{item.userSelection}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[10px]">Correct Verification:</span>
                          <span className="text-green-400 font-medium">{item.correct}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 justify-center mt-6">
                  <button onClick={() => setGameFinished(false)} className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition">Back Menu</button>
                  <button onClick={() => startGame(activeGame)} className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition">Replay Module 🔄</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Default Dashboard View Cards */
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Progress Card */}
              <div className="bg-[#151c33] p-5 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-gray-400 text-sm font-medium">Fluency Milestone</h3>
                  <span className="text-xs text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-md font-mono">Level A1</span>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-3xl font-bold">60% Done</p>
                    <p className="text-xs text-gray-400 mt-1">Next target: B1 Proficiency</p>
                  </div>
                  <div className="w-12 h-12 rounded-full border-4 border-indigo-500 flex items-center justify-center text-sm font-bold shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                    60%
                  </div>
                </div>
                <div className="w-full bg-gray-700 h-2 rounded-full mt-4">
                  <div className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-2 rounded-full w-[60%]"></div>
                </div>
              </div>

              {/* Daily Streak Card */}
              <div className="bg-[#151c33] p-5 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-2xl rounded-full"></div>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-gray-400 text-sm font-medium">Daily Streak</h3>
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div>
                    <p className="text-3xl font-bold">15 Days</p>
                    <p className="text-xs text-gray-400 mt-1">Keep it up! Top 5% consistency</p>
                  </div>
                  <div className="w-14 h-14 rounded-full border-4 border-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)] bg-green-500/10 text-green-400">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                  </div>
                </div>
              </div>

              {/* Leaderboard Card */}
              <div className="bg-[#151c33] p-5 rounded-2xl border border-gray-800 shadow-xl">
                <h3 className="text-gray-400 text-sm font-medium mb-4">Top Speakers Leaderboard</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-yellow-500 text-xl">🥇</span>
                      <img src="https://ui-avatars.com/api/?name=Top+5&background=random" className="w-6 h-6 rounded-full" alt="Top 5" />
                      <span className="text-sm font-medium">Top 5 Squad</span>
                    </div>
                    <span className="text-sm font-bold text-gray-300">120k xp</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm font-bold ml-1">2</span>
                      <img src="https://ui-avatars.com/api/?name=Jaoma&background=random" className="w-6 h-6 rounded-full" alt="Jaoma" />
                      <span className="text-sm">Jaoma</span>
                    </div>
                    <span className="text-sm font-bold text-gray-300">28%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm font-bold ml-1">5</span>
                      <img src="https://ui-avatars.com/api/?name=Arif&background=random" className="w-6 h-6 rounded-full" alt="Arif" />
                      <span className="text-sm text-purple-400 font-semibold">Arif (You)</span>
                    </div>
                    <span className="text-sm font-bold text-purple-400">10%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE CALL PRACTICE SECTION */}
            <div className="bg-gradient-to-br from-[#121a3f] to-[#0a1128] border border-[#2a3665] rounded-3xl p-8 mb-8 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 w-64 h-64 bg-cyan-500/10 blur-[80px] rounded-full"></div>
              <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500/10 blur-[80px] rounded-full"></div>

              <div className="relative z-10">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold tracking-wide">LIVE CALL PRACTICE</h2>
                  <div className="flex items-center gap-3">
                    <span className="bg-red-500/20 text-red-400 text-xs px-3 py-1 rounded-full border border-red-500/30 font-bold">18+ Verified</span>
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 items-center">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center w-40 backdrop-blur-sm relative hover:bg-white/10 transition cursor-pointer">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">ONLINE</div>
                    <div className="w-16 h-16 mx-auto rounded-full border-2 border-green-400 p-0.5 mb-3">
                      <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80" alt="Chahat" className="w-full h-full rounded-full object-cover" />
                    </div>
                    <h4 className="font-bold text-sm">Chahat, 21</h4>
                    <p className="text-xs text-gray-400 mt-1">(India, C1 Level)</p>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center w-40 backdrop-blur-sm relative hover:bg-white/10 transition cursor-pointer">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">ONLINE</div>
                    <div className="w-16 h-16 mx-auto rounded-full border-2 border-green-400 p-0.5 mb-3">
                      <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80" alt="Aarish" className="w-full h-full rounded-full object-cover" />
                    </div>
                    <h4 className="font-bold text-sm">Aarish, 24</h4>
                    <p className="text-xs text-gray-400 mt-1">(UK, B1 Level)</p>
                  </div>

                  <div className="flex-1"></div>

                  <div className="flex gap-4">
                    <button className="bg-gradient-to-b from-indigo-500/20 to-purple-600/40 border border-purple-500/50 p-4 rounded-2xl w-36 flex flex-col items-center justify-center hover:scale-105 transition shadow-lg">
                      <div className="bg-purple-600 w-12 h-12 rounded-full flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(147,51,234,0.5)]">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                      </div>
                      <p className="text-xs text-gray-300 text-center">Match Instantly</p>
                      <p className="text-sm font-bold mt-1">Voice Call</p>
                    </button>
                    
                   <button 
  onClick={isCalling ? endCall : startCall}
  className={`flex flex-col items-center justify-center border transition-all duration-300 shadow-lg p-4 rounded-xl ${
    isCalling 
      ? 'bg-red-500 hover:bg-red-600 border-red-400 text-white animate-pulse' 
      : 'bg-gradient-to-b from-indigo-500/20 to-purple-600/40 border-purple-500/30 hover:scale-105 text-white'
  }`}
>
  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${isCalling ? 'bg-white/20' : 'bg-purple-600'}`}>
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinejoin="round" strokeWidth="2">
      <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.72l.54 2.21a1 1 0 01-.24.93l-1.27 1.27a16 16 0 006.75 6.75l1.27-1.27a1 1 0 01.93-.24l2.21.54a1 1 0 01.72.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  </div>
  <p className="text-xs text-gray-300 text-center">Match Instantly</p>
  <p className="text-sm font-bold mt-1">{isCalling ? "Disconnect" : "Voice Call"}</p>
</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* BOTTOM BANNER - AGORA */}
        <div className="bg-gradient-to-r from-[#0d1636] to-[#121c45] border border-blue-500/30 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center gap-6 z-10">
            <div className="bg-green-500/20 p-3 rounded-2xl border border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
              <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-wider">18+ SECURE AGORA CALLING SYSTEM</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-cyan-400 font-bold text-2xl tracking-tighter">agora</span>
                <span className="text-cyan-400 font-medium">SDK Integrated</span>
              </div>
            </div>
          </div>

          {/* Fake Audio Waveform */}
          <div className="flex items-end gap-1 h-12 opacity-50 z-10 hidden md:flex">
            {[40, 70, 30, 90, 50, 80, 20, 60, 100, 45, 75, 35, 85, 55, 95, 25, 65, 15, 70, 50].map((height, i) => (
              <div key={i} className="w-1.5 bg-cyan-400 rounded-full" style={{ height: `${height}%` }}></div>
            ))}
          </div>

          <div className="sm:absolute bottom-0 right-0 bg-green-500 text-white text-xs font-bold px-4 py-1.5 rounded-tl-xl flex items-center gap-2 z-10 self-end sm:self-auto">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 01.414 0z" clipRule="evenodd"></path></svg>
            Safe Space Verified
          </div>
        </div>

      </main>
      </div>
    </div>
  );
}

export default TalkVaultDashboard;