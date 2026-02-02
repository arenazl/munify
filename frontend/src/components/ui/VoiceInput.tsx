import { useState, useEffect, useRef } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
}

export function VoiceInput({ onTranscript, onError }: VoiceInputProps) {
  const { theme } = useTheme();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.continuous = false; // Auto-stop después de hablar
    recognition.interimResults = false; // Solo resultado final
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        onTranscript(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);

      const errors: Record<string, string> = {
        'no-speech': 'No se detectó voz.',
        'audio-capture': 'No se pudo acceder al micrófono.',
        'not-allowed': 'Permiso de micrófono denegado.',
        'network': 'Error de conexión.',
      };

      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        onError?.(errors[event.error] || 'Error al grabar');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [onTranscript, onError]);

  const isSupported = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;

  const handleClick = () => {
    if (!isSupported) {
      onError?.('Tu navegador no soporta reconocimiento de voz.');
      return;
    }

    if (!recognitionRef.current) {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (error) {
        onError?.('Error al iniciar. Asegurate de dar permiso al micrófono.');
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isSupported}
      className="p-2 sm:p-2.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
      style={{
        backgroundColor: isListening ? '#ef4444' : `${theme.primary}15`,
        color: isListening ? '#ffffff' : theme.primary,
      }}
      title={
        !isSupported
          ? 'No soportado en este navegador'
          : isListening
            ? 'Grabando... hablá ahora'
            : 'Tocar para hablar'
      }
    >
      {isListening ? (
        <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
      ) : (
        <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
      )}
    </button>
  );
}
