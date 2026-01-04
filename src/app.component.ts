import { Component, ChangeDetectionStrategy, signal, ViewChild, ElementRef, computed, inject, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, LandmarkInfo } from './services/gemini.service';

type AppState = 'welcome' | 'capturing' | 'loading' | 'result' | 'error';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class AppComponent implements OnDestroy {
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  private geminiService = inject(GeminiService);
  private stream: MediaStream | null = null;

  // State Management
  appState = signal<AppState>('welcome');
  capturedImage = signal<string | null>(null);
  landmarkInfo = signal<LandmarkInfo | null>(null);
  errorMessage = signal<string>('');

  // TTS State
  isNarrating = signal(false);
  private utterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    effect(() => {
      const info = this.landmarkInfo();
      if (info?.history) {
        this.utterance = new SpeechSynthesisUtterance(info.history);
        this.utterance.onstart = () => this.isNarrating.set(true);
        this.utterance.onend = () => this.isNarrating.set(false);
        this.utterance.onerror = () => this.isNarrating.set(false);
      } else {
        this.utterance = null;
      }
    }, { allowSignalWrites: true });
  }

  async startCamera() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (this.videoElement) {
          this.videoElement.nativeElement.srcObject = this.stream;
          this.appState.set('capturing');
        }
      } else {
        this.showError('Camera not available on this device.');
      }
    } catch (err) {
      console.error(err);
      this.showError('Could not access the camera. Please check permissions.');
    }
  }

  capturePhoto() {
    if (!this.videoElement || !this.canvasElement) return;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      const dataUrl = canvas.toDataURL('image/jpeg');
      this.capturedImage.set(dataUrl);
      this.stopCamera();
      this.processPhoto(dataUrl);
    }
  }

  async processPhoto(imageDataUrl: string) {
    this.appState.set('loading');
    const base64Data = imageDataUrl.split(',')[1];

    try {
      const landmarkName = await this.geminiService.identifyLandmark(base64Data);

      if (landmarkName.toLowerCase().includes('unknown')) {
          this.showError("Couldn't identify a landmark. Please try another photo.");
          return;
      }

      const info = await this.geminiService.fetchLandmarkHistory(landmarkName);
      this.landmarkInfo.set({ ...info, name: landmarkName });
      this.appState.set('result');
    } catch (error) {
        console.error("Error processing photo:", error);
        this.showError("An unexpected error occurred while analyzing the image.");
    }
  }

  toggleNarration() {
    if (!this.utterance) return;

    if (this.isNarrating()) {
      window.speechSynthesis.cancel();
      this.isNarrating.set(false);
    } else {
      window.speechSynthesis.speak(this.utterance);
    }
  }

  reset() {
    this.stopCamera();
    this.capturedImage.set(null);
    this.landmarkInfo.set(null);
    this.errorMessage.set('');
    this.appState.set('welcome');
    if (this.isNarrating()) {
      window.speechSynthesis.cancel();
    }
  }

  private stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  private showError(message: string) {
    this.errorMessage.set(message);
    this.appState.set('error');
    this.stopCamera();
  }
  
  ngOnDestroy(): void {
    this.stopCamera();
    window.speechSynthesis.cancel();
  }
}
