import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
    const { user, loginWithGoogle, loading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user && !loading) {
            navigate('/');
        }
    }, [user, loading, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen bg-bg-primary flex items-center justify-center text-text-primary">
                <div className="w-8 h-8 border-4 border-border border-t-accent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4 font-sans">
            <div className="w-full max-w-[450px] p-10 pb-9 flex flex-col items-center text-center">
                <div className="mb-4 flex flex-col items-center">
                    <div className="flex items-center gap-1 mb-6">
                        <div className="w-10 h-7 bg-red-600 rounded-md flex items-center justify-center">
                            <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[10px] border-l-white"></div>
                        </div>
                        <span className="text-2xl font-bold -tracking-wider text-text-primary">MyTube</span>
                    </div>

                    <h1 className="text-2xl font-normal text-text-primary mb-2">Sign in</h1>
                    <p className="text-base text-text-primary m-0">to compare your thumbs with your competitors</p>
                </div>

                <div className="w-full mt-10 flex justify-center">
                    <button
                        onClick={loginWithGoogle}
                        className="bg-white text-[#1f1f1f] border border-[#dadce0] rounded py-2.5 px-6 text-sm font-medium cursor-pointer flex items-center justify-center gap-3 transition-colors hover:bg-[#f8faff] hover:shadow-sm hover:border-[#d2e3fc]"
                    >
                        <img
                            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                            alt="Google"
                            className="w-[18px] h-[18px]"
                        />
                        <span>Sign in with Google</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
