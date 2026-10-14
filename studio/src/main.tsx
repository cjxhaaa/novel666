import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/base.css';
import './styles/ui.css';
import './styles/views.css';
import './styles/codex.css';
import './styles/places.css';

createRoot(document.getElementById('root')!).render(<App />);
