const Auth = {
    user: null,
    onAuthStateChange: null,
    isSignUp: false,

    init() {
        console.log("[Auth] Initializing authentication...");
        const savedUser = localStorage.getItem('roomio_user');
        if (savedUser) {
            this.user = JSON.parse(savedUser);
            console.log("[Auth] Session restored:", this.user.email);
        }
        this._setupListeners();

        // Auto-launch sign-in if not authenticated
        if (!this.user) {
            setTimeout(() => this.signIn(), 500); // Slight delay for smoother entrance
        }
    },

    _setupListeners() {
        const authForm = document.getElementById('auth-form');
        const switchBtn = document.getElementById('auth-switch-btn');
        const togglePassBtn = document.getElementById('auth-toggle-pass');

        if (authForm) {
            authForm.addEventListener('submit', (e) => this.handleAuthSubmit(e));
        }

        if (switchBtn) {
            switchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAuthMode();
            });
        }

        if (togglePassBtn) {
            togglePassBtn.addEventListener('click', () => {
                const passInput = document.getElementById('auth-password');
                const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passInput.setAttribute('type', type);
                
                // Update icon
                const icon = togglePassBtn.querySelector('i') || togglePassBtn.querySelector('svg');
                if (icon) {
                    const iconName = type === 'password' ? 'eye' : 'eye-off';
                    togglePassBtn.innerHTML = `<i data-lucide="${iconName}" style="width:16px; height:16px;"></i>`;
                    if (window.lucide) window.lucide.createIcons();
                }
            });
        }
    },

    toggleAuthMode() {
        this.isSignUp = !this.isSignUp;
        const title = document.getElementById('auth-title');
        const subtitle = document.getElementById('auth-subtitle');
        const submitText = document.getElementById('auth-submit-text');
        const switchText = document.getElementById('auth-switch-text');
        const switchBtn = document.getElementById('auth-switch-btn');
        const errorDiv = document.getElementById('auth-error');

        if (errorDiv) errorDiv.classList.add('hidden');

        if (this.isSignUp) {
            title.innerText = "Create Account";
            subtitle.innerText = "Start designing your dream home today";
            submitText.innerText = "Sign Up";
            switchText.innerText = "Already have an account?";
            switchBtn.innerText = "Sign In";
        } else {
            title.innerText = "Welcome Back";
            subtitle.innerText = "Continue your architectural journey";
            submitText.innerText = "Sign In";
            switchText.innerText = "Don't have an account?";
            switchBtn.innerText = "Sign Up";
        }
    },

    async signIn() {
        // Now triggers the modal instead of prompt
        const modalAuth = document.getElementById('modal-auth');
        const backdrop = document.getElementById('modal-backdrop');
        const errorDiv = document.getElementById('auth-error');
        if (errorDiv) errorDiv.classList.add('hidden');
        
        if (modalAuth && backdrop) {
            modalAuth.classList.remove('hidden');
            backdrop.classList.remove('hidden');
            document.getElementById('auth-email').focus();
        }
    },

    async handleAuthSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const remember = document.getElementById('auth-remember').checked;
        const submitBtn = document.getElementById('auth-submit-btn');
        const spinner = document.getElementById('auth-spinner');
        const text = document.getElementById('auth-submit-text');
        const errorDiv = document.getElementById('auth-error');

        if (errorDiv) errorDiv.classList.add('hidden');

        // Show loading state
        submitBtn.disabled = true;
        spinner.classList.remove('hidden');
        text.style.opacity = '0.5';

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Basic mock validation
        if (email.length < 5 || password.length < 4) {
            if (errorDiv) {
                errorDiv.innerText = "Please enter a valid email and a stronger password.";
                errorDiv.classList.remove('hidden');
            }
            submitBtn.disabled = false;
            spinner.classList.add('hidden');
            text.style.opacity = '1';
            return;
        }

        // Default Admin Check
        const isAdmin = (email === 'admin@roomio.pro' && password === 'adminpassword');
        
        const user = {
            id: isAdmin ? 'admin_001' : 'user_' + Math.random().toString(36).substr(2, 9),
            email,
            role: isAdmin ? 'admin' : 'user'
        };

        this.user = user;
        if (remember) {
            localStorage.setItem('roomio_user', JSON.stringify(this.user));
        }
        
        if (this.onAuthStateChange) this.onAuthStateChange(this.user);
        
        // Hide modal
        document.getElementById('modal-auth').classList.add('hidden');
        document.getElementById('modal-backdrop').classList.add('hidden');
        
        // Reset form
        submitBtn.disabled = false;
        spinner.classList.add('hidden');
        text.style.opacity = '1';
        e.target.reset();

        console.log(`[Auth] ${this.isSignUp ? 'Registered' : 'Signed in'} as ${email}`);
    },

    async signOut() {
        this.user = null;
        localStorage.removeItem('roomio_user');
        if (this.onAuthStateChange) this.onAuthStateChange(null);
        console.log("[Auth] Signed out");
    },

    isAuthenticated() {
        return !!this.user;
    }
};

document.addEventListener('DOMContentLoaded', () => Auth.init());
window.RoomioAuth = Auth;
