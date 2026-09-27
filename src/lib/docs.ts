export const DOCS: Record<string, { title: string; body: string[] }> = {
  "user-agreement": {
    title: "User Agreement",
    body: [
      "By creating a Polygon account you agree to use the platform for lawful purposes only and to keep your login credentials confidential.",
      "This deployment is a demonstration environment. All market prices, balances, orders and positions are simulated. No real funds are held, transferred or traded.",
      "You are responsible for all activity carried out under your account. Polygon may suspend accounts that show signs of abuse or automated misuse.",
    ],
  },
  "privacy-policy": {
    title: "Privacy Policy",
    body: [
      "We store the mobile number you register with, your account identifier and the support conversations you have with our team.",
      "Support messages are stored so that both you and our agents can read the full history of a conversation. They are not shared with third parties.",
      "You can request deletion of your account and its associated support history at any time through live chat.",
    ],
  },
  "legal-notices": {
    title: "Legal Notices",
    body: [
      "Nothing on this platform constitutes financial advice. Simulated market data is generated for demonstration purposes and does not reflect real market conditions.",
      "Trading leveraged products carries significant risk. In a production deployment you should only trade with capital you can afford to lose.",
      "Polygon is a product name used for this demonstration build and is not affiliated with any existing exchange.",
    ],
  },
  "about-us": {
    title: "About Us",
    body: [
      "Polygon is a mobile-first trading interface covering spot and futures markets with a live order book and a built-in support desk.",
      "The interface is designed for fast decision making: market shortcuts, highlighted pairs and a persistent bottom navigation across Home, Spot, Futures and Assets.",
      "Market data in this build is simulated. The structure allows a real market-data provider to be connected later without changing the interface.",
    ],
  },
};
