// src/Chat.js

import React, { useState } from 'react';
import axios from 'axios';

const Chat = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Add user message to the chat
    setMessages([...messages, { text: input, user: 'user' }]);
    setInput('');

    // Send the user message to the server for a response
    try {
      const response = await axios.post('/get_response', { message: input });
      const botResponse = response.data.response;

      // Add bot response to the chat
      setMessages([...messages, { text: botResponse, user: 'bot' }]);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleClear = () => {
    // Clear the chat messages
    setMessages([]);
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
        <button type="button" onClick={handleClear}>
          Clear
        </button>
      </form>
      <div className="chat">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.user === 'user' ? 'user' : 'bot'}`}
          >
            {message.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Chat;
