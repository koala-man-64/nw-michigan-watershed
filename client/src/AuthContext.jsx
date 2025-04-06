import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  const login = (token) => {
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setIsAuthenticated(true);

    try {
      const decoded = jwtDecode(token);
      setUser(decoded);
      
      // Calculate time until expiration and set auto-logout
      const expirationTime = decoded.exp * 1000;
      const timeLeft = expirationTime - Date.now();
      setTimeout(() => {
        logout();
      }, timeLeft);
    } catch (err) {
      console.error("Token decoding error during login:", err);
      logout();
    }
  };

  // Function to log the user out and clear stored token
  const logout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
    navigate('/login');
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const expirationTime = decoded.exp * 1000;
        if (expirationTime < Date.now()) {
          logout();
          return;
        }
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setIsAuthenticated(true);
        setUser(decoded);
        const timeLeft = expirationTime - Date.now();
        const logoutTimer = setTimeout(() => {
          logout();
        }, timeLeft);
        return () => clearTimeout(logoutTimer);
      } catch (err) {
        console.error('Token decoding error:', err);
        logout();
      }
    }
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, setUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
