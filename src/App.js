import React,{useState} from 'react'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
// import Home from '../src/components/home';
import TextArea from '../src/components/textarea';
import About from '../src/components/about';
import Navbar from '../src/components/navbar';
import Alert from '../src/components/alert';

function App() {
  const [mode,setMode]=useState('light');
  const [alert,setAlert]=useState(null);

  const showAlert=(message,type)=>{
      setAlert({
        msg:message,
        type:type
      })
  }
  const toggleMode = ()=>{
    if (mode==='light') {
      setMode('dark');
      document.body.style.backgroundColor='#042743';
      showAlert("Dark Mode has been enabled","success");
      document.title="Notepad Dark Mode";
    }
    else{
      setMode('light');
      document.body.style.backgroundColor='white';
      showAlert("Light Mode has been enabled","warning");
      document.title="Notepad Light Mode";
    }
  }
  return (
    <Router>
    <Navbar head="NotePad" mode={mode} toggleMode={toggleMode}/>
    <Alert alert={alert}/>
      <Routes>
        <Route exact path='' element={<TextArea showAlert={showAlert} head="Welcome to NotePad" mode={mode} />}/>
        <Route exact path='/about' element={<About />}/>
      </Routes>
    </Router>
  );
}

export default App;
