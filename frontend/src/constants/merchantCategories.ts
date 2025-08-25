export const MerchantCategoryList = {
    Tuition: "Tuition",
    Housing: "Housing",
    Books: "Books",
    FoodGroceries: "Food & Groceries",
    RestaurantsFastFood: "Restaurants & Fast Food",

    Transport: "Transport",
    Utilities: "Utilities",
    DataAirtime: "Data & Airtime",
    Hardware: "Hardware",

    Libraries: "Libraries",
    LabsClassrooms: "Labs & Classrooms",
    HealthServices: "Health & Wellness",
    StudentCenter: "Student Center & Societies",
    SportsRecreation: "Sports & Recreation",
    ArtsCulture: "Arts & Culture",
    AccommodationServices: "Campus Accommodation Services",
    StationerySupplies: "Stationery & Supplies",

    Apparel: "Apparel",
    FinancialServices: "Financial Services",

    Other: "Other",
    GeneralRetail: "General Retail",
} as const;

export type MerchantCategory =
    (typeof MerchantCategoryList)[keyof typeof MerchantCategoryList];
