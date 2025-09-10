interface LoadingScreenProps {
  isVisible: boolean;
}

export function LoadingScreen({ isVisible }: LoadingScreenProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 mb-4">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot"></div>
          <div className="w-3 h-3 bg-accent rounded-full pulse-dot" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" style={{ animationDelay: '0.4s' }}></div>
        </div>
        <h1 className="text-3xl font-bold text-primary mb-2">CityGen</h1>
        <p className="text-muted-foreground">Generating your city...</p>
      </div>
    </div>
  );
}
