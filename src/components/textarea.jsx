import React, { useState } from 'react';
import './text.css';
// import axios from 'axios';

function Textarea(props) {
  const [text, setText] = useState('Enter the text 2');
  // const [japaneseText, setJapaneseText] = useState('');
  // const [btn,setBtn]=useState("Enter dark mode");


  // const translateText = async () => {
  //   try {
  //     const response = await axios.post(
  //       `https://translation.googleapis.com/language/translate/v2?key=YOUR_API_KEY`,
  //       {
  //         q: text,
  //         target: 'ja', // Target language: Japanese
  //       }
  //     );

  //     const translatedText = response.data.data.translations[0].translatedText;
  //     setJapaneseText(translatedText);
  //   } catch (error) {
  //     console.error('Error translating text:', error);
  //   }
  // };

  const [style,setStyle]=useState({
    color: 'white',
    backgroundColor: 'black'
  })

  const handleUpClick = () => {
    let newText = text.toUpperCase();
    setText(newText);
    props.showAlert("Converted to Uppercase!","success");
  };

  const handleUpChange = (event) => {
    setText(event.target.value);
  };

  const handleClear = () => {
    let newText = '';
    setText(newText);
  };

  const handleTextToSpeech = () => {
    if ('speechSynthesis' in window) {
      const speech = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(speech);
    } else {
      alert('Text-to-speech is not supported in this browser.');
    }
  };

  // const toggle = () => {
  //   if (style === 'light-mode') {
  //     setStyle('dark-mode');
  //     setBtn("Enter Light Mode");
  //   } else {
  //     setStyle('light-mode');
  //     setBtn("Enter Dark Mode");
  //   }
  // }

  return (
    <>
      <div className={`container ${style}`} style={{color: props.mode==='dark'?'white':'#042743'}}>
        <h1>{props.head}</h1>
        <div className='mb-3'>
          <textarea
            className="form-control"
            onChange={handleUpChange}
            value={text}
            id="myBox"
            rows="8"
            style={{ resize: "none" }}
            cols="30"
          ></textarea>
        </div>
        <button onClick={handleUpClick} className="btn btn-primary mx-2 my-2">Convert to UpperCase</button>
        <button onClick={handleClear} className="btn btn-danger mx-2 my-2">Clear</button>
        <button onClick={handleTextToSpeech} className="btn btn-success mx-2 my-2">Text to Speech</button>
  {/*<button onClick={translateText} className="btn btn-primary mx-2">Translate to Japanese</button>*/}
      </div>
      <div className={`container ${style}`} style={{color: props.mode==='dark'?'white':'#042743'}}>
        <h1>Text Summary</h1>
        <p>Character Count: {text.split(" ").filter((element)=>{return element.length!==0}).length}</p>
        <p>Estimated Reading Time: {0.008 * text.split(" ").filter((element)=>{return element.length!==0}).length} minutes</p>
        <p>{text}</p>
      </div>
      {/*<div>
        <h2>Japanese Translation:</h2>
        <p>{japaneseText}</p>
  </div>*/}
    </>
  );
}

export default Textarea;
