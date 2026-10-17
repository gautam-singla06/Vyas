export interface Facility {
  id: string;
  name: string;
  location: string;
  status: string;
  rating: number;
  type: string;
  services: string[];
  certification: string;
  phone: string;
  email?: string;
  emergency?: string;
  beds: number | string;
  medicines: string;
  doctors: number | string;
  aiInsight: string;
  logo?: string;
}
