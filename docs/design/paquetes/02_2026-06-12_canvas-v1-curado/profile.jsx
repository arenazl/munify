// Profile picture (640x640) — what WhatsApp Business uses as avatar.
// Bold, recognizable, the M mark dominates so it reads tiny.

const PROFILE_SIZE = 640;

const ProfilePic = () => (
  <div style={{
    width: PROFILE_SIZE, height: PROFILE_SIZE,
    background: 'var(--cream)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    fontFamily: 'var(--sans)',
  }}>
    {/* subtle radial */}
    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.6), transparent 65%)',
    }}/>
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36,
      position: 'relative',
    }}>
      <LogoMark size={300} variant="light" centerHex/>
      <span className="display-roman" style={{
        fontSize: 84, color: 'var(--logo-navy)', lineHeight: 1, fontWeight: 500,
      }}>Munify</span>
    </div>
  </div>
);

// Alternate: just the mark on cream — bigger, no wordmark — for very tight crops
const ProfilePicMarkOnly = () => (
  <div style={{
    width: PROFILE_SIZE, height: PROFILE_SIZE,
    background: 'var(--cream)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--sans)',
    position: 'relative',
  }}>
    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.7), transparent 70%)',
    }}/>
    <div style={{ position: 'relative' }}>
      <LogoMark size={440} variant="light" centerHex/>
    </div>
  </div>
);

window.ProfilePic = ProfilePic;
window.ProfilePicMarkOnly = ProfilePicMarkOnly;
window.PROFILE_SIZE = PROFILE_SIZE;
